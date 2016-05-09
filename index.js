#!/usr/bin/env node

var version = require('./package').version;
var program = require('commander');
var fs = require('fs');
var prompt = require('prompt');

var Spinner = require('cli-spinner').Spinner;
var spinner = new Spinner();

var isPiped = !process.stdout.isTTY;

// CLI configuration
new Promise(function(resolve, reject) {
  program
    .version(version)
    .usage('[options] <file>')
    .option('-H, --host <s>', 'Root URL for Jira client')
    .option('-u, --username <s>', 'Username')
    .option('-p, --password <s>', 'Password')
    .parse(process.argv);

  var missingOptions = ['host', 'username', 'password']
    .filter(option => !program[option]);

  if (missingOptions.length) {
    if (isPiped) {
      console.error('Missing required options:', missingOptions.join(', '));
      process.exit(1);
    }

    prompt.message = '';
    prompt.start();
    prompt.get(missingOptions.map(option => {
      const define = {name: option};
      if (option === 'password') {
        define.hidden = true;
      }
      return define;
    }, {}), (err, result) => {
      prompt.stop();

      if (err) {
        return reject(err);
      }

      Object.keys(result).forEach(key => {
        program[key] = result[key];
      });

      resolve();
    });
  } else {
    resolve();
  }
}).then(() => {
  var client = require('./src/client')({
    host: program.host,
    basic_auth: { // eslint-disable-line
      username: program.username,
      password: program.password
    }
  }, spinner);
  var api = require('./src/api')(client);

  if (!isPiped) {
    spinner.start();
  }

  return api.worklog().then(projects => {
    var stringify = JSON.stringify(projects, null, 4);

    if (!isPiped) {
      spinner.stop(true);
    }

    if (program.args[0]) {
      fs.writeFile(program.args[0], stringify);
      console.error('Output written to:', program.args[0]);
    } else {
      console.log(stringify);
    }
  });
}).catch(error => {
  console.error(error);
});
