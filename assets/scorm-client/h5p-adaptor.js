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

  if (result.score) {
    scorm.set('cmi.core.score.raw', result.score.scaled * 100);
    scorm.set('cmi.core.score.min', '0');
    scorm.set('cmi.core.score.max', '100');
  }

  if (!result.score || masteryScore === undefined || isNaN(masteryScore)) {
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

  // Question title from object.definition.name, fallback to object.id fragment
  var name = stmt.object && stmt.object.definition && stmt.object.definition.name
    ? (stmt.object.definition.name['en-US'] || stmt.object.definition.name[Object.keys(stmt.object.definition.name)[0]])
    : null;
  if (!name && stmt.object && stmt.object.id) {
    name = stmt.object.id.split('/').pop().split('?')[0];
  }
  if (name) {
    scorm.set('cmi.interactions.' + n + '.id', name);
  }

  // Interaction type (SCORM 1.2: choice, fill-in, matching, performance, sequencing, likert, numeric)
  var iType = stmt.object && stmt.object.definition && stmt.object.definition.interactionType
    ? stmt.object.definition.interactionType
    : 'choice';
  scorm.set('cmi.interactions.' + n + '.type', iType);

  // Result
  if (stmt.result) {
    var resultVal = stmt.result.success === true ? 'correct'
      : stmt.result.success === false ? 'wrong'
      : 'unanticipated';
    scorm.set('cmi.interactions.' + n + '.result', resultVal);
  }
};

// xAPI events are external:true — they always reach H5P.externalDispatcher.
// answered  → record individual interaction (populates Target in TC)
// completed → set overall lesson_status / score (single Scored row in TC)
H5P.externalDispatcher.on('xAPI', function (event) {
  var stmt = event.data.statement;
  var verbId = stmt.verb && stmt.verb.id ? stmt.verb.id.split('/').pop() : '';

  if (verbId === 'answered' && stmt.result) {
    setInteraction(stmt);
  } else if (verbId === 'completed' && stmt.result) {
    setCompletion(stmt.result);
  }
});
