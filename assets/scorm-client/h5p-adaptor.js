var scorm = pipwerks.SCORM;

function init() {
  scorm.init();
}

function set(param, value) {
  scorm.set(param, value);
}

function get(param) {
  scorm.get(param);
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

var onCompleted = function (result) {
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

// H5P.instances is empty at this point (H5P initializes async).
// xAPI events are created with external:true, so they always reach
// H5P.externalDispatcher regardless of iframe nesting.
H5P.externalDispatcher.on('xAPI', function (event) {
  var stmt = event.data.statement;
  var verbId = stmt.verb && stmt.verb.id ? stmt.verb.id.split('/').pop() : '';
  if ((verbId === 'completed' || verbId === 'answered') && stmt.result) {
    onCompleted(stmt.result);
  }
});
