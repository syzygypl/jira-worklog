#!/usr/bin/env node

var version = require('./package').version;
var program = require('commander');
var fs = require('fs');

var Spinner = require('cli-spinner').Spinner;
var spinner = new Spinner();

var isPiped = !process.stdout.isTTY;

// CLI configuration

program
  .version(version)
  .usage('[options] <file>')
  .option('-H, --host <s>', 'Root URL for Jira client')
  .option('-u, --username <s>', 'Username')
  .option('-p, --password <s>', 'Password')
  .parse(process.argv);

['host', 'username', 'password'].forEach(option => {
  if (!program[option]) {
    console.error('Error: Missing option --' + option);
    program.outputHelp();
    process.exit(1);
  }
});

// Processing starts here

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

api.getProjectWorklog('SYZ')
  .then(projects => {
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
  })
  .catch(error => {
    console.error(error);
  });
