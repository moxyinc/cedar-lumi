var scorm = pipwerks.SCORM;
var tcEndpoint = window.location.origin + '/wp-admin/admin-ajax.php?action=process-xapi-statement';
var tcActor = null;
var ivCompletionFired = false;

function init() {
  var ok = scorm.init();
  if (ok) {
    var name = scorm.get('cmi.core.student_name') || 'Learner';
    var id = scorm.get('cmi.core.student_id') || '';
    tcActor = { objectType: 'Agent', name: name };
    if (id && id.indexOf('@') !== -1) {
      tcActor.mbox = 'mailto:' + id;
    } else if (id) {
      tcActor.account = { homePage: window.location.origin, name: id };
    } else {
      tcActor.mbox = 'mailto:learner@' + window.location.hostname;
    }
  }
}

function end() {
  scorm.quit();
}

function startIVCompletionMonitor() {
  var interval = setInterval(function () {
    if (ivCompletionFired) { clearInterval(interval); return; }
    var instances = (H5P && H5P.instances) ? H5P.instances : [];
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      if (!inst || !inst.video || typeof inst.getDuration !== 'function' || typeof inst.hasMainSummary !== 'function') continue;
      if (inst.hasMainSummary()) continue; // summary dialog will fire completed via Submit
      var duration = inst.getDuration();
      var current = inst.video.getCurrentTime ? inst.video.getCurrentTime() : 0;
      if (duration > 0 && current >= duration - 5) {
        ivCompletionFired = true;
        clearInterval(interval);
        setCompletion(null);
      }
    }
  }, 1000);
}

window.onload = function () {
  init();
  startIVCompletionMonitor();
};

window.onunload = function () {
  end();
};

var interactionCount = 0;

var setCompletion = function (result) {
  var masteryScore;
  if (scorm.version == '2004') {
    masteryScore = scorm.get('cmi.scaled_passing_score');
  } else if (scorm.version == '1.2') {
    masteryScore = scorm.get('cmi.student_data.mastery_score') / 100;
  }

  if (result && result.score) {
    scorm.set('cmi.core.score.raw', result.score.scaled * 100);
    scorm.set('cmi.core.score.min', '0');
    scorm.set('cmi.core.score.max', '100');
  }

  if (!result || !result.score || masteryScore === undefined || isNaN(masteryScore)) {
    scorm.status('set', 'completed');
  } else {
    var passed = result.score.scaled >= masteryScore;
    if (scorm.version == '2004') {
      scorm.status('set', 'completed');
      scorm.set('cmi.success_status', passed ? 'passed' : 'failed');
    } else if (scorm.version == '1.2') {
      scorm.status('set', passed ? 'passed' : 'failed');
    }
  }
};

var setInteraction = function (stmt) {
  var n = interactionCount++;

  var name = stmt.object && stmt.object.definition && stmt.object.definition.name
    ? (stmt.object.definition.name['en-US'] || stmt.object.definition.name[Object.keys(stmt.object.definition.name)[0]])
    : null;
  if (!name && stmt.object && stmt.object.id) {
    name = stmt.object.id.split('/').pop().split('?')[0];
  }
  if (name) {
    scorm.set('cmi.interactions.' + n + '.id', name);
  }

  var iType = stmt.object && stmt.object.definition && stmt.object.definition.interactionType
    ? stmt.object.definition.interactionType
    : 'choice';
  scorm.set('cmi.interactions.' + n + '.type', iType);

  // Determine result: prefer success flag, fall back to score
  var resultVal = 'unanticipated';
  if (stmt.result) {
    if (stmt.result.success === true) {
      resultVal = 'correct';
    } else if (stmt.result.success === false) {
      resultVal = 'wrong';
    } else if (stmt.result.score) {
      resultVal = stmt.result.score.scaled === 1 ? 'correct' : 'wrong';
    }
  }
  scorm.set('cmi.interactions.' + n + '.result', resultVal);
};

var generateUUID = function () {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    var r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};

var forwardToTC = function (stmt) {
  if (!tcActor || !stmt.verb || !stmt.object) return;
  // TC requires object.id to be a valid IRI — H5P uses local numeric IDs, fix them
  var obj = stmt.object;
  if (obj.id && obj.id.indexOf('http') !== 0) {
    obj = Object.assign({}, obj, {
      id: window.location.origin + '/h5p/activity/' + encodeURIComponent(obj.id)
    });
  }
  var statement = {
    id: generateUUID(),
    timestamp: new Date().toISOString(),
    actor: tcActor,
    verb: stmt.verb,
    object: obj
  };
  if (stmt.result) statement.result = stmt.result;
  if (stmt.context) statement.context = stmt.context;
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('POST', tcEndpoint, true);
    xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
    xhr.send('statement=' + encodeURIComponent(JSON.stringify(statement)));
  } catch (e) {}
};

H5P.externalDispatcher.on('xAPI', function (event) {
  var stmt = event.data.statement;
  var verbId = stmt.verb && stmt.verb.id ? stmt.verb.id.split('/').pop() : '';

  // Forward to Tin Canny xAPI endpoint so Target column is populated
  forwardToTC(stmt);

  if (verbId === 'answered') {
    if (stmt.result) {
      setInteraction(stmt);
      // Set score/status on answered as fallback (in case completed never fires)
      setCompletion(stmt.result);
    }
  } else if (verbId === 'completed') {
    // completed may fire with or without a result — always set lesson_status
    setCompletion(stmt.result || null);
  }
});
