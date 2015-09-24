const _ = require('lodash');
const clone = require('gulp-clone');
const del = require('del');
const es = require('event-stream');
const fs = require('fs');
const graphviz = require('graphviz');
const Guid = require('guid');
const gulp = require('gulp');
const path = require('path');
const rename = require('gulp-rename');
const runSequence = require('run-sequence');
const spawn = require('child_process').spawn;
const template = require('gulp-template');

///////////////////////////////////////////////////////////////

const projectRefs = { 'Main': {} };
const level1 = addNestedLevelTo('Main');
const level2 = addNestedLevelToAll(level1);
const level3 = addNestedLevelToAll(level2);
const level4 = addNestedLevelToAll(level3);

addExtraRefs();

const projectList = generateProjectList(projectRefs);

//shareOutput();


function addExtraRefs() {
	projectRefs['Main']['MainTrueFalse'] = false;
	projectRefs['Main']['MainNullFalse'] = false;
	projectRefs['Main']['MainFalseFalse'] = false;
}

function shareOutput() {
	projectList.forEach(project => {
		if (project.name !== 'Main')
			project.sharedOutput = true;
	});
}

///////////////////////////////////////////////////////////////

gulp.task('default', function (done) {
	runSequence('clean', 'generate', 'build', 'graph', done);
});

gulp.task('clean', function (done) {
	del(['dist'])
		.then(() => done());
});

gulp.task('generate', function () {
	return generate(projectList);
})

gulp.task('build', function (done) {
	const msbuild = spawn('msbuild', ['dist\\Solution.sln'], { stdio: 'inherit' });
	msbuild.on('exit', function (code) {
		console.log('msbuild exited with code ' + code);
		done();
	});
	msbuild.on('error', done);
});

gulp.task('graph', function (done) {
	const g = graphviz.digraph('G');

	const added = {};
	function addNode(name) {
		if (added[name]) return;
		added[name] = true;

		const node = g.addNode(name);
		node.set('label', '');
		node.set('fixedsize', 'true');
		node.set('width', '0.25');
		node.set('height', '0.25');

		if (exists(path.join(__dirname, 'dist/Main/bin/debug', name + '.dll'))) {
			node.set('style', 'filled');
			node.set('fillcolor', 'black');
		}

		_.forEach(projectRefs[name], (private, ref) => {
			addNode(ref);
			const edge = g.addEdge(node, ref);
			switch (private) {
				case true:
					edge.set('color', 'black');
					break;
				case false:
					edge.set('color', 'red');
					break;
				default:
					edge.set('color', 'black');
					edge.set('style', 'dotted');
					break;
			}
		});
	}

	addNode('Main');

	console.log(g.to_dot());
	g.output('png', 'graph.png');

	done();
});

function generate(projectList) {
	return es.merge(
		generateSolution(projectList),
		generateProjects(projectList))
	.pipe(gulp.dest('dist'));
}

function generateSolution(projectList) {
	return gulp.src('templates/Solution.sln')
		.pipe(template({
			solutionGuid: Guid.create(),
			projects: projectList
		}));
}

function generateProjects(projectList) {
	const srcStream = gulp.src('templates/project/**/*');
	srcStream.setMaxListeners(0); // this stream is going to get cloned a LOT

	const projectStreams = projectList.map(function (project) {
		return srcStream.pipe(clone())
			.pipe(rename(function (p) {
				p.dirname = path.join(project.name, p.dirname);
				p.basename = templateFilename(p.basename, project);
			}))
			.pipe(template(project));
	});

	return es.merge(projectStreams);
}

function addNestedLevelTo(name) {
	projectRefs[name + 'True'] = {};
	projectRefs[name + 'Null'] = {};
	projectRefs[name + 'False'] = {};
	projectRefs[name][name + 'True'] = true;
	projectRefs[name][name + 'Null'] = null;
	projectRefs[name][name + 'False'] = false;
	return [name + 'True', name + 'Null', name + 'False'];
}

function addNestedLevelToAll(arr) {
	return _.flatten(arr.map(function (name) { return addNestedLevelTo(name); }));
}

function generateProjectList(projectRefs) {
	const projects = _.map(projectRefs, function (refs, key) {
		return {
			name: key,
			guid: Guid.create(),
			sharedOutput: false
		};
	});

	projects.forEach(function (project) {
		project.refs = _.map(projectRefs[project.name], function (private, ref) {
			return {
				name: ref,
				guid: _.find(projects, p => p.name === ref).guid,
				private: private
			};
		});
	});

	return projects;
}

function exists(file) {
	try {
		fs.statSync(file);
		return true;
	} catch (err) {
		if (err.code === 'ENOENT')
			return false;
		throw err;
	}
}

function templateFilename(filename, data) {
	const replaced = filename.replace('[[', '<%=')
		.replace(']]', '%>');
	return _.template(replaced, data);
}
