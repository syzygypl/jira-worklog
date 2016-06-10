module.exports = function(client) {
  const GROUP_UNKNOWN = '__unknown__';

  var groups = client('groups.findGroups', {maxResults: 1000})
    .then(groups => {
      return Promise.all(groups.groups.map(group => {
        return client('group.getGroup', {
          groupName: group.name,
          expand: ['users']
        });
      }));
    });

  var users = groups.then(groups => {
    groups.push({name: GROUP_UNKNOWN});

    var map = new Map();

    groups.forEach(group => {
      if (group.users) {
        group.users.items.forEach(user => {
          var set = map.get(user.key);
          if (!set) {
            set = new Set();
            map.set(user.key, set);
          }
          set.add(group.name);
        });
      }
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
    return groups.then(groups => {
      return groups.reduce((acc, group) => {
        acc[group.name] = 0;
        return acc;
      }, {});
    }).then(timespent => {
      return Promise.all(issues.map(issue => {
        return Promise.all([
          users, client('issue.getWorkLogs', {issueId: issue.id})
        ])
          .then(results => {
            var users = results[0];
            var worklogs = results[1];

            worklogs.worklogs
              .forEach(worklog => {
                var isUnknown = true;

                if (worklog => worklog.author.key || worklog.author.name) {
                  const key = worklog.author.key || worklog.author.name;
                  const set = users.get(key);
                  // console.log(worklog.author, set);
                  if (set) {
                    isUnknown = false;

                    for (var group of set) {
                      timespent[group] =
                          (timespent[group] || 0) +
                          Math.round(worklog.timeSpentSeconds / 3600);
                    }
                  }
                }

                if (isUnknown) {
                  timespent[GROUP_UNKNOWN] = (timespent[GROUP_UNKNOWN] || 0) +
                      Math.round(worklog.timeSpentSeconds / 3600);
                }
              });
          });
      })).then(() => timespent);
    });
  }

  return {
    getAllProjects() {
      return client('project.getAllProjects').then(projects => {
        return projects.map(project => project.key);
      });
    },

    getProjectVersions(projectKey) {
      return getVersions(projectKey).then(items => {
        return Promise.all(items.map(item => {
          return getTimespent(item.issues).then(timespent => {
            item.version.timespent = timespent;
            item.version.projectKey = projectKey;
            item.version.dataUpdateDate = new Date().toString();

            return item.version;
          });
        }));
      });
    },

    worklog() {
      return this.getAllProjects().then(projects => {
        return Promise.all(projects.map(project => {
          return this.getProjectVersions(project);
        }));
      }).then(projects => {
        return projects.reduce((acc, versions) => acc.concat(versions), []);
      });
    }
  };
};
