var ScriptsEditor = function(sprite, project) {
  this.sprite = sprite;
  this.project = project;
  this.el = el('.editor');
  this.cm = CodeMirror(this.el, cmOptions);

  var code = Compiler.generate(sprite.scripts);
  // TODO handle errors in generate()
  this.hasChangedEver = false;
  this.cm.setValue(code);
  this.needsCompile = ko(true);
  this.hasErrors = sprite._hasErrors;
  assert(ko.isObservable(sprite._hasErrors));
  this.widgets = [];

  this.cm.clearHistory();
  assert(this.cm.getHistory().done.length === 0);
  this.cmUndoSize = 0;
  this.undoing = false;

  // send options to CM, so initial highlight is correct
  this.checkDefinitions();
  this.repaint();

  this.annotate = this.cm.annotateScrollbar('error-annotation');

  // repaint when variable/list names change
  this.bindNames(sprite.variables);
  this.bindNames(sprite.lists);
  this.bindNames(project.variables);
  this.bindNames(project.lists);

  // compile after new scripts editor is opened
  // TODO this makes initial load feel slow
  App.needsCompile.assign(true);
  this.compile();
  App.needsPreview.assign(true);

  this.cm.on('change', this.onChange.bind(this));

  // vim mode
  App.settings.keyMap.subscribe(function(keyMap) {
    if (keyMap === 'default') {
      keyMap = removeUndoKeys(CodeMirror.keyMap.default);
    }
    this.cm.setOption('keyMap', keyMap);
  }.bind(this));

  this.cm.save = App.preview.bind(App, true);
  this.cmUndo = this.cm.undo.bind(this.cm);
  this.cmRedo = this.cm.redo.bind(this.cm);
  this.cm.undo = Oops.undo;
  this.cm.redo = Oops.redo;
};


ScriptsEditor.prototype.bindNames = function(names) {
  names.map(function(item) {
    item._name.subscribe(function() {
      this.debounceRepaint();
    }.bind(this), false);
  }.bind(this));
};

ScriptsEditor.prototype.fixLayout = function(offset) {
  this.cm.setSize(NaN, this.el.clientHeight);

  // make sure scrollbar has width (cm.display.barWidth)
  // otherwise annotations won't appear!
  this.cm.setOption('scrollbarStyle', 'native');
  this.cm.setOption('scrollbarStyle', cmOptions.scrollbarStyle);
};

ScriptsEditor.prototype.compile = function() {
  if (!this.needsCompile()) return this.hasErrors();

  // clear error indicators
  this.widgets.forEach(function(widget) {
    widget.clear();
  });
  this.widgets = [];

  // flush variables (in case we cmd+return inside a variable)
  var objects = this.sprite.variables().concat(this.sprite.lists());
  objects.forEach(function(obj) {
    if (obj._isEditing()) {
      obj._flush();
    }
  });

  // parse lines
  var options = this.getModeCfg();
  var iter = this.cm.doc.iter.bind(this.cm.doc);
  var lines = Compiler.parseLines(iter, options);
  var stream = lines.slice();

  // build 'em for each line with shape of "error"
  var anns = [];
  stream.forEach(function(block, index) {
    if (block.info.shape === 'error') {
      var line = index;
      anns.push({ from: Pos(line, 0), to: Pos(line + 1, 0) });
    }
  });

  try {
    var scripts = Compiler.compile(stream);
  } catch (err) {
    var line = lines.length - (stream.length - 1); // -1 because EOF
    line = Math.min(line, lines.length - 1);

    var info = lines[line].info;
    var message = info.shape === 'error' ? info.error : err.message;

    var widgetEl = el('.error-widget', message);
    var widget = this.cm.addLineWidget(line, widgetEl, {});
    this.widgets.push(widget);
    anns.push({ from: Pos(line, 0), to: Pos(line, 0) });
    this.annotate.update(anns);

    this.needsCompile.assign(false);
    this.hasErrors.assign(true);
    return true; // has errors
  }

  this.needsCompile.assign(false);
  this.hasErrors.assign(false);
  this.sprite.scripts = scripts;
  return false;
};

ScriptsEditor.prototype.makeDirty = function() {
  this.needsCompile.assign(true);
  App.needsCompile.assign(true);
  App.needsPreview.assign(true);
  if (this.hasChangedEver) App.needsSave.assign(true);
}

ScriptsEditor.prototype.getModeCfg = function() {
  var _this = this;
  function getNames(kind) {

    var project = _this.project;
    var targets = _this.sprite._isStage ? project.sprites().concat([project])
                                        : [project, App.active()];
    var objects = allVariables(targets);

    var names = _this.sprite[kind]();
    if (!_this.sprite._isStage) {
      // include global var/list names
      names = names.concat(project[kind]());
    }

    var seen = {};
    return names.filter(function(item) {
      var name = item._name();
      var index = objects.indexOf(item);
      var seen = seenNames(objects.slice(0, index));
      return name && name === Language.cleanName(kind, name, seen, {});
    });
  }

  // force re-highlight --slow!
  return {
    name: 'tosh',
    variables: getNames('variables'),
    lists: getNames('lists'),
    definitions: this.definitions,
  };
};


ScriptsEditor.prototype.repaint = function() {
  var modeCfg = this.getModeCfg();

  // force re-highlight --slow!
  this.cm.setOption('mode', modeCfg);

  clearTimeout(this.repaintTimeout);
  this.repaintTimeout = null;
};

ScriptsEditor.prototype.debounceRepaint = function() {
  this.makeDirty();
  if (this.repaintTimeout) {
    clearTimeout(this.repaintTimeout);
  }
  this.repaintTimeout = setTimeout(this.repaint.bind(this), 500);
};

ScriptsEditor.prototype.checkDefinitions = function() {
  var defineParser = new Earley.Parser(Language.defineGrammar);

  var definitions = [];
  this.cm.doc.iter(function(line) {
    var line = line.text;
    if (!Language.isDefinitionLine(line)) return;

    var tokens = Language.tokenize(line);
    var results;
    try {
      results = defineParser.parse(tokens);
    } catch (e) { return; }
    if (results.length > 1) throw "ambiguous define. count: " + results.length;
    var define = results[0].process();
    definitions.push(define);
  });

  var oldDefinitions = this.definitions;
  if (JSON.stringify(oldDefinitions) !== JSON.stringify(definitions)) {
    this.definitions = definitions;
    return true;
  }
};

ScriptsEditor.prototype.activated = function() {
  doNext(function() {
    this.fixLayout();
    this.cm.focus();
    this.cm.refresh();

    this.debounceRepaint();
  }.bind(this));
};

ScriptsEditor.prototype.focus = function() {
  this.cm.focus();
};

ScriptsEditor.prototype.undo = function() {
  this.undoing = true;
  this.cmUndo();
  this.undoing = false;
  this.cmUndoSize = this.cm.historySize().undo;

  App.active.assign(this.sprite);
};

ScriptsEditor.prototype.redo = function() {
  this.undoing = true;
  this.cmRedo();
  this.undoing = false;
  this.cmUndoSize = this.cm.historySize().undo;

  App.active.assign(this.sprite);
};

ScriptsEditor.prototype.varsChanged = function() {
  this.hasChangedEver = true;
  this.makeDirty();
};

ScriptsEditor.prototype.onChange = function(cm, change) {
  this.hasChangedEver = true;
  this.makeDirty();

  // analyse affected lines
  var lineNos = [];
  var lines = [];
  for (var i=change.from.line; i<=change.to.line; i++) {
    lineNos.push(i);
    lines.push(this.cm.getLine(i));
  }
  lines = lines.concat(change.removed);
  lines = lines.concat(change.text);
  this.linesChanged(lines);

  // clear error widget
  for (var i=0; i<this.widgets.length; i++) {
    var widget = this.widgets[i];
    if (lineNos.indexOf(widget.line.lineNo()) > -1) {
      widget.clear();
      this.widgets.splice(i, 1);
      break; // this will only remove the first one
    }
  }

  // check undo state
  if (!this.undoing) {
    // TODO. We assume that every CM history operation will emit 'change'
    var historySize = this.cm.historySize();
    // nb. historySize appears to exclude selection operations, which is good
    if (historySize.undo !== this.cmUndoSize) {
      // assume every 'change' event create at most one undo operation
      assert(historySize.undo === this.cmUndoSize + 1)
      var op = new Oops.CustomOperation(this.undo.bind(this),
                                        this.redo.bind(this));
      Oops.insert(op);
      this.cmUndoSize++;
    }
    assert(this.cmUndoSize === historySize.undo);
  }

  // trigger auto-complete!
  requestHint(this.cm);

  // clear annotations
  this.annotate.update([]);
};

ScriptsEditor.prototype.linesChanged = function(lines) {
  for (var i=0; i<lines.length; i++) {
    var line = lines[i];
    if (Language.isDefinitionLine(line)) {
      if (this.checkDefinitions()) {
        this.debounceRepaint();
      }
      return;
    }
  }
};
