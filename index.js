const {
  lstatSync,
  readdirSync,
  existsSync,
  readFile,
  writeFile,
} = require('fs');
const { join } = require('path');
const { hostname } = require('os');
const { promisify } = require('util');
const untildify = require('untildify');
const uuid = require('uuid/v4');
const { unnest } = require('ramda');
const git2json = require('@fabien0102/git2json');

const readFileAsync = promisify(readFile);
const writeFileAsync = promisify(writeFile);

// CONSTANTS
const DB = '~/.local/share/quantified-self/commits.json';

const isDirectory = path => lstatSync(path).isDirectory();
const isRepository = path => existsSync(join(path, '.git'));
const isUser = (commit, userEmail) => commit.author.email === userEmail;

const uuidFromSha1 = hash =>
  hash.substring(0, 8) +
  '-' + hash.substring(8, 12) +
  '-' + (5 + hash.substring(13, 16)) +
  '-' + ((parseInt(hash.substring(16, 18), 16) & 0x3F ) | 0x80).toString(16) +
  hash.substring(18, 20) +
  '-' + hash.substring(20, 32);

const expandRepoPaths = paths =>
  paths.map(p => untildify(p)).reduce((acc, p) => {
    let res;
    if (isRepository(p)) {
      res = [p];
    } else {
      const subdirs = readdirSync(p)
        .map(name => join(p, name))
        .filter(isDirectory && isRepository);
      res = subdirs;
    }

    return [...acc, ...res];
  }, []);

const repoHistories = (repositoryPaths, userEmail) =>
  expandRepoPaths(repositoryPaths).map(path =>
    git2json
      .run({ path })
      .then(json => json
        .filter(commit => isUser(commit, userEmail))
        .map(commit =>
          Object.assign(
            {
              timestamp: commit.author.timestamp,
              dataType: 'activity-hack',
              dataSource: `git@${hostname}`,
              uuid: uuidFromSha1(commit.hash),
            },
            commit
          )
        )
      )
      .catch(err => {
        console.error(`Can't get git log for ${path} :: ${err.message})`);
        return [];
      })
  );

// TODO: is there any reason to factor this out further? Thinking that if I do
// then a change in wording on a few things is in order.


const getPrevious = db => {
  let res;
  if (existsSync(db)){
    res = readFileAsync(db, { encoding: 'utf8' })
      .then(contents => JSON.parse(contents))
      .catch(err => console.log(err));
  } else {
    res = [];
  }
  return res;
};

const duplicate = (commit, index, self) =>
  index === self.findIndex(c => (
    c.uuid === commit.uuid && c.timestamp === commit.timestamp
  ))

const getUpdatedHistory = (repositoryPaths, userEmail) =>
  Promise.all([
      getPrevious(untildify(DB)),
      ...repoHistories(repositoryPaths, userEmail),
    ])
    .then(history => unnest(history).filter(duplicate))
    .catch(err => console.log(err))

const writeUpdatedHistory = ( repositoryPaths, userEmail ) =>
  getUpdatedHistory(repositoryPaths, userEmail)
    /* .then(history => console.log(JSON.stringify(history, null, '  '))); */
    .then(history => writeFileAsync(untildify(DB), JSON.stringify(history,
      null, '  ')));
//
//
//
//
//
//
//
//
//
const repos = ['~/etc', '~/src/hack', '~/cloud/Dropbox/work'];
const user = 'fielding@justfielding.com';

writeUpdatedHistory( repos, user );
