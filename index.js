// TODO: fix the sync/async inconsistencies and rewrite
// exclusively using promises
const {
  lstatSync,
  mkdir,
  readdirSync,
  existsSync,
  readFile,
  writeFile,
} = require('fs');
const { join } = require('path');
const { hostname } = require('os');
const { promisify } = require('util');
const untildify = require('untildify');
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
      try {
        res = readdirSync(p)
          .map(name => join(p, name))
          .filter(isDirectory && isRepository);
      } catch (err) {
        if (err.code === 'ENOENT') {
          console.error(`Skipping "${p}", because the directory was not found! `);
          res = [];
        } else {
          throw err;
        }
      }

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
        console.error(`Can't get git log for ${path} :: ${err})`);
        return [];
      })
  );

// TODO: is there any reason to factor this out further? Thinking that if I do
// then a change in wording on a few things is in order.


const getPrevious = db =>
  readFileAsync(db, { encoding: 'utf8' })
    .then(contents => JSON.parse(contents))
    .catch(() => {
      console.error(`No previous history found at ${db}`);
      // TODO: fix this and other sync/async inconsistencies
      mkdir(db.substr(0, db.lastIndexOf('/')), { recursive: true }, err => {
        if (err) throw err;
      });
      return [];
    });

const duplicate = (commit, index, self) =>
  index === self.findIndex(c => (
    c.uuid === commit.uuid && c.timestamp === commit.timestamp
  ));

const getUpdatedHistory = (repositoryPaths, userEmail) =>
  Promise.all([
    getPrevious(untildify(DB)),
    ...repoHistories(repositoryPaths, userEmail),
  ])
    .then(history => [].concat(...history).filter(duplicate));

const writeUpdatedHistory = ( repositoryPaths, userEmail ) =>
  getUpdatedHistory(repositoryPaths, userEmail)
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
