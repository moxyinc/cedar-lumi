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
    scorm.set('cmi.core.score.scaled', result.score.scaled * 100);
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

// H5P.externalDispatcher only relays events in Lumi's iframe architecture
// (H5P.isFramed && H5P.externalEmbed === false). In a standalone SCORM page,
// xAPI events fire on H5P.instances directly. This file loads after h5p-bundle.js
// so H5P.instances is already populated.
(H5P.instances || []).forEach(function (instance) {
  H5P.on(instance, 'xAPI', function (event) {
    var result = event.data.statement.result;
    var verbId = event.data.statement.verb && event.data.statement.verb.id
      ? event.data.statement.verb.id.split('/').pop()
      : '';
    if ((verbId === 'completed' || verbId === 'answered') && result) {
      onCompleted(result);
    }
  });
});
