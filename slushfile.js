//@formatter:off
var _          = require('lodash');
var gulp       = require('gulp');
var gConflict  = require('gulp-conflict');
var gEjs       = require('gulp-ejs');
var gRename    = require('gulp-rename');
var inquirer   = require('inquirer');
var prettyjson = require('prettyjson');
//@formatter:on

function processStateAnswers(answers) {

  function ucFirst(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  function hyphenToSnakeCase(string) {
    return string.split('-').map(ucFirst).join('')
  }

  function createConfigFnName(app, state) {
    return [
      app,
      'States',
      state.split('.').map(hyphenToSnakeCase).join(''),
      'Config'
    ].join('');
  }

  function createCtrlFnName(app, state) {
    return [
      ucFirst(app),
      'States',
      state.split('.').map(hyphenToSnakeCase).join(''),
      'Ctrl'
    ].join('');
  }

  function createOutputDir(answers) {
    return ['src', 'states'].concat(answers.state.split('.')).join('/');
  }

  _.extend(answers, {
    baseState:     answers.state.split('.').pop(),
    moduleName:    [answers.app, 'states', answers.state].join('.'),
    outputDir:     createOutputDir(answers),
    stateConfigFn: createConfigFnName(answers.app, answers.state),
    stateCtrlFn:   createCtrlFnName(answers.app, answers.state)
  });

  answers.appModules.map(function (module) {
    var moduleParts = module.name.split('.');
    var parentModule = moduleParts.slice(0, -1).join('.');
    var stateModuleDepth = answers.state.split('.').length + 1;
    var relativeSrcDir = new Array(stateModuleDepth + 1).join('../').slice(0, -1);

    module.importName = moduleParts.shift()  + moduleParts.map(hyphenToSnakeCase).join('');

    if (parentModule === answers.moduleName) {
      module.from = './' + moduleParts[moduleParts.length - 1];
    } else {
      module.from = moduleParts.reduce(function (path, modulePart) {
        return path + '/components/' + modulePart;
      }, relativeSrcDir);
    }

    return module;
  });

  return answers;
}

function promptConfirmAnswers(answers, cb) {
  answers = processStateAnswers(answers);
  console.log(prettyjson.render(answers));

  inquirer.prompt([
    {type: 'confirm', name: 'continue', message: 'Continue?'}
  ], function (confirmAnswer) {
    _.extend(answers, confirmAnswer);
    cb(answers);
  })
}

function promptAddAppModule(answers, cb) {
  answers.appModules = answers.appModules || [];

  inquirer.prompt([
    {type: 'confirm', name: 'yes', message: 'add app module?'}
  ], function (addModuleAnswer) {
    if (!addModuleAnswer.yes) {
      answers.appModules.sort();
      promptConfirmAnswers(answers, cb);
    } else {
      inquirer.prompt([
        {
          type:     'input',
          name:     'name',
          message:  'The name of the angular module to include'
        }
      ], function (module) {
        if (module.name.length) {
          answers.appModules.push(module);
        }
        promptAddAppModule(answers, cb);
      });
    }
  });
}

function promptAddNpmModule(answers, cb) {
  if (!answers.npmModules) {
    answers.npmModules = [
      {
        packageName: 'angular-ui-router',
        moduleName:  'ui.router'
      }
    ];
  }

  inquirer.prompt([
    {type: 'confirm', name: 'yes', message: 'add npm module?'}
  ], function (addModuleAnswer) {
    if (!addModuleAnswer.yes) {
      answers.npmModules.sort();
      promptAddAppModule(answers, cb);
    } else {
      inquirer.prompt([
        {
          type:     'input',
          name:     'packageName',
          message:  'Name of npm package name'
        },
        {
          type:     'input',
          name:     'moduleName',
          message:  'The name of the angular module the package provides'
        }
      ], function (npmModule) {
        if (npmModule.packageName && npmModule.moduleName) {
          answers.npmModules.push(npmModule);
        }
        promptAddNpmModule(answers, cb);
      });
    }
  });
}

function promptStateOptions(cb) {
  inquirer.prompt([
    {
      type:     'input',
      name:     'app',
      message:  'The root module for the app',
      validate: function (input) {
        return (input.length) ? true : 'An app module is required';
      }
    },
    {
      type:     'input',
      name:     'state',
      message:  'The state to create',
      validate: function (input) {
        return (input.length) ? true : 'A state is required';
      }
    }
  ], function (answers) {
    promptAddNpmModule(answers, cb);
  });
}

function buildIndex(answers) {
  return gulp.src(__dirname + '/templates/state/index.ejs')
    .pipe(gEjs(answers, {ext: '.js'}))
    .pipe(gConflict('./' + answers.outputDir))
    .pipe(gulp.dest('./' + answers.outputDir))
}

function buildConfig(answers) {
  return gulp.src(__dirname + '/templates/state/config.ejs')
    .pipe(gEjs(answers, {ext: '.js'}))
    .pipe(gRename(answers.baseState + '-config.js'))
    .pipe(gConflict('./' + answers.outputDir))
    .pipe(gulp.dest('./' + answers.outputDir));
}

function buildCtrl(answers) {
  return gulp.src(__dirname + '/templates/state/ctrl.ejs')
    .pipe(gEjs(answers, {ext: '.js'}))
    .pipe(gRename(answers.baseState + '-ctrl.js'))
    .pipe(gConflict('./' + answers.outputDir))
    .pipe(gulp.dest('./' + answers.outputDir));
}

function buildTemplate(answers) {
  return gulp.src(__dirname + '/templates/state/template.ejs')
    .pipe(gEjs(answers))
    .pipe(gRename(answers.baseState + '.html'))
    .pipe(gConflict('./' + answers.outputDir))
    .pipe(gulp.dest('./' + answers.outputDir));
}

gulp.task('state', function (done) {
  promptStateOptions(function (answers) {
      if (!answers.continue) {
        return done();
      }

      buildIndex(answers)
        .on('end', function () { return buildConfig(answers); })
        .on('end', function () { return buildCtrl(answers); })
        .on('end', function () { return buildTemplate(answers); })
        .on('end', function () { done(); })
        .resume();
    }
  );
});
