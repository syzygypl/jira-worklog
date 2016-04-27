var version = require('./package').version;
var program = require('commander');
var fs = require('fs');

var Spinner = require('cli-spinner').Spinner;
var spinner = new Spinner();
spinner.setSpinnerString('|/-\\');

program
  .version(version)
  .option('-h, --host <s>', 'Root URL for Jira client')
  .option('-u, --username <s>', 'Username')
  .option('-p, --password <s>', 'Password')
  .option('-o, --output <s>', 'Path for JSON file output')
  .parse(process.argv);

['host', 'username', 'password', 'output'].forEach(option => {
  if (!program[option]) {
    console.error('Error: Missing option --' + option);
    program.outputHelp();
    process.exit(1);
  }
});

var client = require('./src/client')({
  host: program.host,
  basic_auth: { // eslint-disable-line
    username: program.username,
    password: program.password
  }
}, spinner);
var api = require('./src/api')(client);

spinner.start();

api.worklog()
  .then(projects => {
    spinner.setSpinnerTitle('');
    spinner.stop();
    fs.writeFile(program.output, JSON.stringify(projects, null, 4));
    console.log('\nOutput written to:', program.output);
  })
  .catch(error => {
    console.error(error);
  });
