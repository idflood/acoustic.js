const fs = require('fs');
const gulp = require('gulp');
const babelify = require('babelify');
const browserify = require('browserify');
const eslint = require('gulp-eslint');
const browserSync = require('browser-sync').create();
const uglify = require('gulp-uglify');
const rename = require('gulp-rename');
const runSequence = require('run-sequence');

gulp.task('lint', function() {
  return gulp.src(['src/*.js'])
    .pipe(eslint())
    .pipe(eslint.format());
});

gulp.task('script', function() {
  return browserify('./src/acoustic.js', {debug: true, standalone: 'Acoustic'})
    .transform(babelify.configure({
      loose: true
    }))
    .bundle()
    .on('error', function(err) { console.log('Error : ' + err.message); })
    .pipe(fs.createWriteStream('dist/acoustic.js'));
});

gulp.task('compress', function() {
  return gulp.src('dist/acoustic.js')
    .pipe(uglify({
      mangle: true,
      compress: true
    }))
    .pipe(rename({
       extname: '.min.js'
     }))
    .pipe(gulp.dest('dist'));
});

// Static server
gulp.task('browser-sync', function() {
  browserSync.init({
    server: {
      baseDir: './'
    },
    startPath: 'example/index.html'
  });
});

gulp.task('build', function() {
  return runSequence(['lint', 'script'], 'compress');
});

gulp.task('init', function() {
  return runSequence('build', 'browser-sync');
});

gulp.task('default', ['init'], function() {
  gulp.watch('src/*.js', ['build']);
  gulp.watch(['example/*.html', 'dist/acoustic.js'], browserSync.reload);
});
