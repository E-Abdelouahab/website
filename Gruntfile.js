const childProcess = require('child_process');
const path = require('path');
const fs = require('./source/utils/fs-async');
const npm = require('npm');
const semver = require('semver');
const browserify = require('browserify');
const electronPackager = require('electron-packager');
const Bluebird = require('bluebird');
const cliColor = require('ansi-color');
const maxConcurrency = 5;

module.exports = (grunt) => {
  const packageJson = grunt.file.readJSON('package.json');
  const lessFiles = {
    'public/css/styles.css': ['public/less/styles.less', 'public/vendor/css/animate.css', 'public/less/d2h.less']
  };
  fs.readdirSync('./components').map((component) => `components/${component}/${component}`)
    .forEach((str) => lessFiles[`${str}.css`] = `${str}.less`);

  grunt.initConfig({
    pkg: packageJson,
    less: {
      production: { files: lessFiles }
    },
    watch: {
      scripts: {
        files: ['public/source/**/*.js', 'source/**/*.js', 'components/**/*.js'],
        tasks: ['browserify-common', 'browserify-components', 'babel:prod'],
        options: {
          spawn: false,
        },
      },
      less: {
        files: ['public/less/*.less', 'public/styles/*.less', 'components/**/*.less'],
        tasks: ['less:production'],
        options: {
          spawn: false,
        },
      }
    },
    lineending: {
      // Debian won't accept bin files with the wrong line ending
      production: {
        options: {
          eol: 'lf'
        },
        files: {
          './bin/ungit': ['./bin/ungit'],
          './bin/credentials-helper': ['./bin/credentials-helper']
        }
      },
    },
    release: {
      options: {
        commitMessage: 'Release <%= version %>',
      }
    },
    // Run mocha tests
    mochaTest: {
      unit: {
        options: {
          reporter: 'spec',
          require: './test/spec.helper.js',
          timeout: 5000
        },
        src: 'test/*.js'
      },
      click: {
        options: {
          reporter: 'spec',
          timeout: 15000,
          bail: true,
          require: './test/spec.helper.js'
        },
        src: 'nmclicktests/spec.*.js'
      }
    },

    // Plato code analysis
    plato: {
      all: {
        files: {
          'report': ['source/**/*.js', 'public/source/**/*.js'],
        }
      },
    },

    // Minify images (basically just lossless compression)
    imagemin: {
      default: {
        options: {
          optimizationLevel: 3
        },
        files: [{
          expand: true,
          cwd: 'assets/client/images/',
          src: ['**/*.png'],
          dest: 'public/images/'
        }]
      }
    },

    // Embed images in css
    imageEmbed: {
      default: {
        files: {
          'public/css/styles.css': [ 'public/css/styles.css' ],
          'components/graph/graph.css': ['components/graph/graph.css'],
          'components/header/header.css': ['components/header/header.css'],
          'components/staging/staging.css': ['components/staging/staging.css'],
        },
        options: {
          deleteAfterEncoding: false
        }
      }
    },
    jshint: {
      options: {
        undef: true, // check for usage of undefined constiables
        indent: 2,
        esnext: true,
        '-W033': true, // ignore Missing semicolon
        '-W041': true, // ignore Use '===' to compare with '0'
        '-W065': true, // ignore Missing radix parameter
        '-W069': true, // ignore ['HEAD'] is better written in dot notation
      },
      web: {
        options: {
          node: true,
          browser: true,
          globals: {
            'ungit': true,
            'io': true,
            'Raven': true,
            '$': true,
            'jQuery': true,
            'nprogress': true
          }
        },
        files: [
          {
            src: ['public/source/**/*.js', 'components/**/*.js'],
            // Filter out the "compiled" components files; see the browserify task for components
            filter: (src) => src.indexOf('bundle.js') == -1
          }
        ]
      },
      node: {
        options: {
          node: true
        },
        src: ['source/**/*.js']
      },
      bin: {
        options: {
          node: true
        },
        src: [
          'Gruntfile.js',
          'bin/*'
        ]
      },
      mocha: {
        options: {
          node: true,
          globals: {
            'it': true,
            'describe': true,
            'before': true,
            'after': true,
            'window': true,
            'document': true,
            'navigator': true,
            'ungit': true
          }
        },
        src: [
          'test/**/*.js',
          'nmclicktests/**/*.js'
        ]
      }
    },
    copy: {
      main: {
        files: [
          // includes files within path
          { expand: true, flatten: true, src: ['node_modules/nprogress/nprogress.css'], dest: 'public/css/' },
          { expand: true, flatten: true, src: ['node_modules/jquery-ui-bundle/jquery-ui.min.css'], dest: 'public/css/'},
          { expand: true, flatten: true, src: ['node_modules/raven-js/dist/raven.min.js'], dest: 'public/js/' },
          { expand: true, flatten: true, src: ['node_modules/raven-js/dist/raven.min.js.map'], dest: 'public/js/' }
        ]
      }
    },
    clean: {
      electron: ['./build'],
      coverage: ['./coverage'],
      'coverage-unit': ['./coverage/coverage-unit'],
      babel: ['./src']
    },
    electron: {
      package: {
        options: {
          dir: '.',
          out: './build',
          icon: './icon',
          all: true,
          asar: true
        }
      }
    },
    zip_directories: {
      electron: {
        files: [{
          filter: 'isDirectory',
          expand: true,
          cwd: './build',
          dest: './dist',
          src: '*'
        }]
      }
    },
    mocha_istanbul: {
      unit: {
        src: './test',
        options: {
          coverageFolder: './coverage/coverage-unit',
          mask: 'spec.*.js'
        }
      }
    },
    babel: {
      prod: {
        options: {
          presets: ['es2015', 'stage-0']
        },
        files: [{
            expand: true,
            cwd: 'source',
            src: ['**/*.js'],
            dest: 'src',
            ext: '.js'
        }]
      }
    }
  });

  grunt.registerTask('browserify-common', '', function() {
    const done = this.async();
    const b = browserify({
      noParse: ['public/vendor/js/superagent.js'],
      debug: true
    });
    b.add('./public/source/main.js');
    b.require('./public/source/main.js', { expose: 'ungit-main' });
    b.require('./public/source/components.js', { expose: 'ungit-components' });
    b.require('./public/source/program-events.js', { expose: 'ungit-program-events' });
    b.require('./public/source/navigation.js', { expose: 'ungit-navigation' });
    b.require('./public/source/storage.js', { expose: 'ungit-storage' });
    b.require('./public/source/main.js', { expose: 'ungit-main' });
    b.require('./source/address-parser.js', { expose: 'ungit-address-parser' });
    b.require('knockout', { expose: 'knockout' });
    b.require('lodash', { expose: 'lodash' });
    b.require('hasher', { expose: 'hasher' });
    b.require('crossroads', { expose: 'crossroads' });
    b.require('async', { expose: 'async' });
    b.require('moment', { expose: 'moment' });
    b.require('blueimp-md5', { expose: 'blueimp-md5' });
    b.require('color', { expose: 'color' });
    b.require('signals', { expose: 'signals' });
    b.require('util', { expose: 'util' });
    b.require('path', { expose: 'path' });
    b.require('diff2html', { expose: 'diff2html' });
    b.require('bluebird', { expose: 'bluebird' });
    b.require('just-detect-adblock', { expose: 'just-detect-adblock' });
    b.require('./node_modules/snapsvg/src/mina.js', { expose: 'mina' });
    b.require('nprogress', { expose: 'nprogress' });
    b.require('jquery', { expose: 'jquery' });
    b.require('dnd-page-scroll', { expose: 'dnd-page-scroll' });
    b.require('@primer/octicons', { expose: 'octicons' });
    const outFile = fs.createWriteStream('./public/js/ungit.js');
    outFile.on('close', () => done());
    b.bundle().pipe(outFile);
  });

  grunt.registerTask('browserify-components', '',  function() {
    Bluebird.each(fs.readdirSync('components'), (component) => {
      return new Bluebird((resolve, reject) => {
        const b = browserify({
          bundleExternal: false,
          debug: true
        });
        const src = `./components/${component}/${component}.js`;
        if (!fs.existsSync(src)) {
          grunt.log.error(`${src} does not exist. If this component is obsolete, please remove that directory or perform a clean build.`);
          return;
        }
        b.add(src);
        b.external(['ungit-components',
                'ungit-program-events',
                'ungit-navigation',
                'ungit-storage',
                'ungit-main',
                'ungit-address-parser',
                'knockout',
                'lodash',
                'hasher',
                'crossroads',
                'async',
                'moment',
                'blueimp-md5']);

        const outFile = fs.createWriteStream(`./components/${component}/${component}.bundle.js`);
        outFile.on('close', () => resolve());
        b.bundle().pipe(outFile);
      });
    }).then(this.async());
  });

  const bumpDependency = (packageJson, packageName) => {
    return new Bluebird((resolve, reject) => {
      const dependencyType = packageJson['dependencies'][packageName] ? 'dependencies' : 'devDependencies';
      let currentVersion = packageJson[dependencyType][packageName];
      if (currentVersion[0] == '~' || currentVersion[0] == '^') currentVersion = currentVersion.slice(1);
      npm.commands.show([packageName, 'versions'], true, (err, data) => {
        if(err) reject(err);
        const versions = data[Object.keys(data)[0]].versions.filter((v) => {
          return v.indexOf('alpha') == -1;
        });
        const latestVersion = versions[versions.length - 1];
        if (semver.gt(latestVersion, currentVersion)) {
          packageJson[dependencyType][packageName] = '~' + latestVersion;
        }
        resolve();
      });
    });
  };

  const updatePackageJsonBuildVersion = (commitHash) => {
    const packageJson = JSON.parse(fs.readFileSync('package.json'));
    packageJson.version += `+${commitHash}`;
    fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  };
  grunt.registerTask('travisnpmpublish', 'Automatically publish to NPM via travis.', function() {
    const done = this.async();
    if (process.env.TRAVIS_BRANCH != 'master' || (process.env.TRAVIS_PULL_REQUEST && process.env.TRAVIS_PULL_REQUEST != 'false')) {
      grunt.log.writeln('Skipping travis npm publish');
      return done();
    }
    childProcess.exec('git rev-parse --short HEAD', (err, stdout, stderr) => {
      const hash = stdout.trim();
      updatePackageJsonBuildVersion(hash);
      fs.writeFileSync('.npmrc', '//registry.npmjs.org/:_authToken=' + process.env.NPM_TOKEN);
      childProcess.exec('npm publish', (err) => { done(err); });
    });
  });

  grunt.registerTask('electronpublish', ['zip_directories:electron']);

  /**
   * Run clicktest in parallel at test suite level.
   * This test does intermittently fails depends on the maxConcurrency level set
   * above and the capacity of the computer as sometimes lack of resource allocation
   * triggers timeouts.
   * Use at own discretion.
   */
  grunt.registerTask('clickParallel', 'Parallelized click tests.', function() {
    const done = this.async();

    fs.readdirAsync('./nmclicktests')
      .then((files) => files.filter((file) => file.startsWith('spec.')))
      .then((tests) => {
        const genericIndx = tests.indexOf('spec.generic.js');
        if (genericIndx > -1) {
          tests.splice(0, 0, tests.splice(genericIndx, 1)[0]);
        }
        return tests;
      }).then((tests) => {
        grunt.log.writeln('Running click tests in parallel... (this will take a while...)');
        return Bluebird.map(tests, (file) => {
          let output = '';
          const outStream = (data) => output += data;

          grunt.log.writeln(cliColor.set(`Clicktest started! \t${file}`, 'blue'));
          return new Bluebird((resolve, reject) => {
            const child = childProcess.execFile('./node_modules/mocha/bin/mocha', [path.join(__dirname, 'nmclicktests', file), '--timeout=20000', '-b'], { maxBuffer: 10*1024*1024 });
            child.stdout.on('data', outStream);
            child.stderr.on('data', outStream);
            child.on('exit', (code) => {
              if (code == 0) resolve(file);
              else reject();
            });
          }).then(() => {
            grunt.log.writeln(cliColor.set(`'Clicktest success! \t${file}`, 'green'));
            return { name: file, output: output, isSuccess: true };
          }).catch(() => {
            grunt.log.writeln(cliColor.set(`'Clicktest fail! \t'${file}`, 'red'));
            return { name: file, output: output, isSuccess: false };
          });
        }, { concurrency: maxConcurrency });
      }).then((results) => {
        let isSuccess = true;
        results.forEach((result) => {
          if (!result.isSuccess) {
            grunt.log.writeln(`---- start of ${result.name} log ----`);
            grunt.log.writeln(result.output);
            grunt.log.writeln(`----- end of ${result.name} log -----`);
            isSuccess = false;
          }
        });
        done(isSuccess);
      });
  });

  grunt.registerTask('bumpdependencies', 'Bump dependencies to their latest versions.', function() {
    const done = this.async();
    grunt.log.writeln('Bumping dependencies...');
    npm.load(() => {
      const tempPackageJson = JSON.parse(JSON.stringify(packageJson));
      const keys = Object.keys(tempPackageJson.dependencies).concat(Object.keys(tempPackageJson.devDependencies));

      const bumps = Bluebird.map(keys, (dep) => {
        // winston 3.x has different API
        if (dep == 'winston') return;
        // babel 7.x.x has alot of changes.... :(
        if (dep.indexOf('babel') > -1) return;

        return bumpDependency(tempPackageJson, dep);
      });

      Bluebird.all(bumps).then(() => {
        fs.writeFileSync('package.json', `${JSON.stringify(tempPackageJson, null, 2)}\n`);
        grunt.log.writeln('Dependencies bumped, run npm install to install latest versions.');
      }).then(() => { done(); }).catch(done);
    });
  });

  grunt.registerMultiTask('electron', 'Package Electron apps', function() {
    const done = this.async();
    electronPackager(this.options()).then(() => { done(); }, done);
  });

  grunt.event.on('coverage', (lcovFileContents) => {
    // Check below on the section "The coverage event"
    console.log(lcovFileContents);
    console.log('\n\n=== html report: ./coverage/coverage-unit/lcove-report/index.html ===\n\n');
  });

  grunt.loadNpmTasks('grunt-contrib-less');
  grunt.loadNpmTasks('grunt-contrib-watch');
  grunt.loadNpmTasks('grunt-lineending');
  grunt.loadNpmTasks('grunt-release');
  grunt.loadNpmTasks('grunt-mocha-test');
  grunt.loadNpmTasks('grunt-plato');
  grunt.loadNpmTasks('grunt-contrib-imagemin');
  grunt.loadNpmTasks('grunt-image-embed');
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-mocha-istanbul');
  grunt.loadNpmTasks('grunt-babel');
  grunt.loadNpmTasks('grunt-zip-directories');

  // Default task, builds everything needed
  grunt.registerTask('default', ['clean:babel', 'less:production', 'jshint', 'babel:prod', 'browserify-common', 'browserify-components', 'lineending:production', 'imageEmbed:default', 'copy:main', 'imagemin:default']);

  // Run tests without compile (use watcher or manually build)
  grunt.registerTask('unittest', ['mochaTest:unit']);
  grunt.registerTask('clicktest', ['mochaTest:click']);
  grunt.registerTask('test', ['unittest', 'clicktest']);

  // Builds, and then creates a release (bump patch version, create a commit & tag, publish to npm)
  grunt.registerTask('publish', ['default', 'test', 'release:patch']);

  // Same as publish but for minor version
  grunt.registerTask('publishminor', ['default', 'test', 'release:minor']);

  // Create electron package
  grunt.registerTask('package', ['default', 'clean:electron', 'electron']);

  // run unit test coverage, assumes project is compiled
  grunt.registerTask('coverage-unit', ['clean:coverage-unit', 'mocha_istanbul:unit']);
};
