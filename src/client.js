var JiraClient = require('jira-connector');

function resolveTargetFn(context, path) {
  const property = path.shift();

  if (path.length) {
    return resolveTargetFn(context[property], path);
  }

  if (typeof context[property] !== 'function') {
    throw new Error('Function required.');
  }

  return context[property].bind(context);
}

module.exports = function(config, spinner) {
  var jiraClient = new JiraClient(config);
  var queue = [];
  var queueLimit = 50;
  var count = -1;

  return function client(path, options) {
    var fn = resolveTargetFn(jiraClient, path.split('.'));
    count = (count + 1) % queueLimit;

    queue[count] = queue[count] || Promise.resolve();

    queue[count] = queue[count].then(() => {
      if (spinner) {
        spinner.setSpinnerTitle(
          '%s processing ' + path + ' - ' + JSON.stringify(options || {})
        );
      }

      return new Promise((resolve, reject) => {
        fn(options || {}, (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
      });
    });

    return queue[count];
  };
};
