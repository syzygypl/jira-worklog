module.exports = function(client) {
  var users = client('groups.findGroups')
    .then(groups => {
      return Promise.all(groups.groups.map(group => {
        return client('group.getGroup', {
          groupName: group.name,
          expand: ['users']
        });
      }));
    })
    .then(groups => {
      var map = new Map();

      groups.forEach(group => {
        group.users.items.forEach(user => {
          var set = map.get(user.key);
          if (!set) {
            set = new Set();
            map.set(user.key, set);
          }
          set.add(group.name);
        });
      });

      return map;
    });

  function getIssues(versionId, temp, startAt) {
    var maxResults = 1000;
    var count = maxResults + startAt;
    var list = temp ? [].concat(temp) : [];

    return client('search.search', {
      jql: 'fixVersion=' + versionId,
      fields: ['timespent'],
      startAt: startAt || 0,
      maxResults: maxResults
    }).then(issues => {
      list = list.concat(issues.issues.filter(issue => {
        return issue && issue.fields.timespent;
      }));

      if (count < issues.total) {
        return getIssues(versionId, list, count);
      }

      return list;
    });
  }

  function getVersions(projectKey) {
    return client('project.getVersions', {projectIdOrKey: projectKey})
      // load issues
      .then(versions => {
        return Promise.all(versions.map(version => {
          return getIssues(version.id).then(issues => {
            return {version: version, issues: issues};
          });
        }));
      });
  }

  function getTimespent(issues) {
    var timespent = {};

    return Promise.all(issues.map(issue => {
      return Promise.all([
        users, client('issue.getWorkLogs', {issueId: issue.id})
      ])
        .then(results => {
          var users = results[0];
          var worklogs = results[1];

          worklogs.worklogs
            .filter(worklog => worklog.author.key)
            .forEach(worklog => {
              const key = worklog.author.key;
              const set = users.get(key);
              if (set) {
                set.forEach(group => {
                  timespent[group] =
                    (timespent[group] || 0) +
                    Math.round(worklog.timeSpentSeconds / 3600);
                });
              }
            });
        });
    })).then(() => {
      return timespent;
    });
  }

  return {
    getAllProjects() {
      return client('project.getAllProjects').then(projects => {
        return projects.map(project => project.key);
      });
    },

    getProjectWorklog(projectKey) {
      return getVersions(projectKey).then(items => {
        return Promise.all(items.map(item => {
          return getTimespent(item.issues).then(timespent => {
            item.version.timespent = timespent;
            return item.version;
          });
        }));
      }).then(versions => {
        return {project: projectKey, versions: versions};
      });
    },

    worklog() {
      return this.getAllProjects().then(projects => {
        return Promise.all(projects.map(project => {
          return this.getProjectWorklog(project);
        }));
      });
    }
  };
};
