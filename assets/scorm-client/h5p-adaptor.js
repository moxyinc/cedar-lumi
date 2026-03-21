var scorm = pipwerks.SCORM;

function init() {
  scorm.init();
}

function end() {
  scorm.quit();
}

window.onload = function () {
  init();
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

H5P.externalDispatcher.on('xAPI', function (event) {
  var stmt = event.data.statement;
  var verbId = stmt.verb && stmt.verb.id ? stmt.verb.id.split('/').pop() : '';

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
