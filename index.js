const { mkdir, readdir, readFile, stat, writeFile } = require('fs').promises;
const { join, normalize, dirname, resolve  } = require('path');
const { hostname } = require('os');
const untildify = require('untildify');
const git2json = require('@fabien0102/git2json');
const ora = require('ora');

// CONSTANTS
const repoPaths = ['~/etc', '~/src/hack', '/Volumes/stuff/cloud/Dropbox/work'];
const user = 'fielding@justfielding.com';
const DB = '~/.local/share/quantified-self/commits.json';
const dbPath = normalize(untildify(DB));

const isErrorNotFound = err => err.code === 'ENOENT';
const isUser = (commit, userEmail) => commit.author.email === userEmail;

const uuidFromSha1 = hash =>
  hash.substring(0, 8) +
  '-' + hash.substring(8, 12) +
  '-' + (5 + hash.substring(13, 16)) +
  '-' + ((parseInt(hash.substring(16, 18), 16) & 0x3F ) | 0x80).toString(16) +
  hash.substring(18, 20) +
  '-' + hash.substring(20, 32);

// TODO: I wish I was good at naming functions like this one.
const normalizePaths = paths =>
  paths
    .map(untildify)
    .map(normalize);

const flatten = (arr, depth = 1) =>
  arr.reduce((a, v) => a.concat(depth > 1 && Array.isArray(v) ? flatten(v, depth - 1) : v), []);

const duplicate = (commit, index, self) =>
  index === self.findIndex(c => (
    c.dataSource === commit.dataSource && c.uuid === commit.uuid
  ));

const recurse = path =>
  readdir(path)
    .then(list =>
      Promise.all(list.map(file => {
        const fullpath = resolve(path, file);
        return stat(fullpath)
          .then(stats => {
            if (stats.isDirectory()) {
              return isRepository(fullpath);
            }
        });
      })))
    .then(results => results.filter(Boolean))
    .then(flatten);

// TODO: test to make sure that nested repositories are detected
const isRepository = path =>
  stat(join(path, '.git'))
    .then(gPath => {
      if (gPath.isDirectory()) {
        return path;
      }
      return recurse(path);
    })
    .catch(err => {
      if (isErrorNotFound(err)) {
        return recurse(path);
      }
      throw err;
    });

// The word history or histories refers to the commit histories
// and the aggregate commit history we are creating.

const findRepositories = paths =>
  Promise.all(normalizePaths(paths).map(path => isRepository(path)))
    .then(flatten);

const getRepositoryHistories = (repositoryPaths, userEmail) =>
  findRepositories(repositoryPaths)
    .then(repos => Promise.all(repos.map(path =>
      git2json
        .run({ path })
        .then(json => json
          .filter(commit => isUser(commit, userEmail))
          .map(commit =>
            Object.assign(
              {
                timestamp: commit.author.timestamp,
                dataType: 'activity-hack',
                dataSource: `git@${hostname}:${path}`,
                uuid: uuidFromSha1(commit.hash),

              },
              commit
            )))
        .catch(err => {
          console.error(`Can't get git log for ${path} :: ${err})`);
          return [];
        }))));

const getPreviousHistory = db =>
  readFile(db, { encoding: 'utf8' })
    .then(contents => JSON.parse(contents))
    .catch(() => {
      console.error(`No previous history found at ${db}.`);
      return [];
    });

const getUpdatedHistory = (repositoryPaths, userEmail) =>
  Promise.all([
    getPreviousHistory(dbPath),
    getRepositoryHistories(repositoryPaths, userEmail),
  ])
    .then(flatten)
    .then(history => [].concat(...history).filter(duplicate));

const writeToDB = history =>
  mkdir(dirname(dbPath), { recursive: true })
    .then(writeFile(dbPath, JSON.stringify(history, null, '  ')));

ora.promise(getUpdatedHistory(repoPaths, user).then(writeToDB), { text: 'Updating Aggregate Git Commit History', spinner: 'pong' });
