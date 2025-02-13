var Format = (function() {

  function sum(seq) {
    return seq.reduce(function(a, b) { return a + b; }, 0);
  }

  function arrayBufferToBinary(ab) {
    var binary = '';
    var bytes = new Uint8Array(ab);
    var len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode( bytes[ i ] );
    }
    return binary;
  }

  function binaryToArrayBuffer(binary) {
    var len = binary.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      var ascii = binary.charCodeAt(i);
      bytes[i] = ascii;
    }
    return bytes.buffer;
  }

  function loadImage(ext, binary) {
    // here, we abuse observables as a sort of Promise.
    // move along now...

    var image = new Image;
    var src = ko(null);
    var size = ko(null);

    if (ext === 'jpg') ext = 'jpeg';
    if (ext === 'svg') {
      var canvas = el('canvas');
      canvg(canvas, binary, {
      renderCallback: function() {
        src.assign(canvas.toDataURL('image/png'));
      }});
    } else {
      src.assign('data:image/' + ext + ';base64,' + btoa(binary));
    }

    function readSize(image) {
      return {
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    }

    src.subscribe(function(src) {
      image.src = src;
      poll();
      image.addEventListener('load', poll);
    });

    var timeout;
    function poll() {
      if (image.naturalWidth) {
        size.assign(readSize(image));
        clearTimeout(timeout);
        return;
      }
      timeout = setTimeout(poll, 100);
    }

    return {
      src: src,
      size: size,
    };
  }

  function audioFromFile(ext, binary) {
    assert(ext === 'wav');
    var audio = new Audio;
    audio.src = 'data:audio/' + ext + ';base64,' + btoa(binary);
    audio.controls = true;
    return audio;
  }

  function getName(o) {
    return o.objName();
  }

  /***************************************************************************/

  // cache image thumbnails to make initial load faster

  var backdrop = function() {
    return {
      name: ko('backdrop1'),
      ext: 'svg',
      file: "<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='480px' height='360px'><path fill='#ffffff' d='M 0 0 L 480 0 L 480 360 L 0 360 Z' /></svg>",
      bitmapResolution: 1,
      rotationCenterX: 240,
      rotationCenterY: 180,
      _src: ko("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAAXNSR0IArs4c6QAAAAlwSFlzAAALEwAACxMBAJqcGAAAA6ZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IlhNUCBDb3JlIDUuNC4wIj4KICAgPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4KICAgICAgPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIKICAgICAgICAgICAgeG1sbnM6eG1wPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvIgogICAgICAgICAgICB4bWxuczp0aWZmPSJodHRwOi8vbnMuYWRvYmUuY29tL3RpZmYvMS4wLyIKICAgICAgICAgICAgeG1sbnM6ZXhpZj0iaHR0cDovL25zLmFkb2JlLmNvbS9leGlmLzEuMC8iPgogICAgICAgICA8eG1wOk1vZGlmeURhdGU+MjAxNi0wMS0yNVQyMTowMToyMjwveG1wOk1vZGlmeURhdGU+CiAgICAgICAgIDx4bXA6Q3JlYXRvclRvb2w+UGl4ZWxtYXRvciAzLjQuMjwveG1wOkNyZWF0b3JUb29sPgogICAgICAgICA8dGlmZjpPcmllbnRhdGlvbj4xPC90aWZmOk9yaWVudGF0aW9uPgogICAgICAgICA8dGlmZjpDb21wcmVzc2lvbj41PC90aWZmOkNvbXByZXNzaW9uPgogICAgICAgICA8dGlmZjpSZXNvbHV0aW9uVW5pdD4yPC90aWZmOlJlc29sdXRpb25Vbml0PgogICAgICAgICA8dGlmZjpZUmVzb2x1dGlvbj43MjwvdGlmZjpZUmVzb2x1dGlvbj4KICAgICAgICAgPHRpZmY6WFJlc29sdXRpb24+NzI8L3RpZmY6WFJlc29sdXRpb24+CiAgICAgICAgIDxleGlmOlBpeGVsWERpbWVuc2lvbj40PC9leGlmOlBpeGVsWERpbWVuc2lvbj4KICAgICAgICAgPGV4aWY6Q29sb3JTcGFjZT4xPC9leGlmOkNvbG9yU3BhY2U+CiAgICAgICAgIDxleGlmOlBpeGVsWURpbWVuc2lvbj4zPC9leGlmOlBpeGVsWURpbWVuc2lvbj4KICAgICAgPC9yZGY6RGVzY3JpcHRpb24+CiAgIDwvcmRmOlJERj4KPC94OnhtcG1ldGE+Ci3MB8YAAAAVSURBVAgdY/z//z8DDDDBGCAahQMAby0DAwzQlZYAAAAASUVORK5CYII="),
      _size: ko({ width: 480, height: 360 }),
    };
  }

  var turtle = function() {
    return {
      name: ko('turtle'),
      ext: 'svg',
      file: "<svg version='1.1' xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' width='25px' height='20px'><path style='fill:#007de0;stroke:#033042;stroke-width:1;stroke-linejoin:round;' d='M 0,0 20,8 0,16 6,8 Z' /></svg>",
      bitmapResolution: 1,
      rotationCenterX: 8,
      rotationCenterY: 8,
      _src: ko("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABkAAAAUCAYAAAB4d5a9AAABTElEQVQ4T2NkMnT5xcDI/JWBmWXmvy+fJjJcP/ycgcqAkckiIPM/n3wbg4AiB+P9Pf8ZGRhP//31uZvh4oEt1LKLEWQQo0XQRga1ANf/8nacDC8vMjDd3fmR4f3d/9TyHdgSEGAy8Xr9z75JhIFLBCLw4wMD48MDP6jhO7glDIZO8kysvFf+uU/kwQgmCn2HsATkG1D8CKq2/DfJFsIaH2T6DsUSjPjBF/Mk+A7DEqzxg88yJN/9//fn3v+zO3TQlVPHkgf7fzI+2PuP4d/fe//ObidsCTg5qwe4/Jez48KbTyDB9Ynhw91/DEz4MzJmxAuotvw3xRPxUFeTkmlJScJEuRqb7/FnRjJcjdMSlHggIayJLdsgBSQvqIBU4ASlEFLCmnhLQEU9E/NXQimEWAOxB5e+gw81i3W8EU+JSwnpxZrjCWkiVZ4ulgAAfsb6FdvZrw8AAAAASUVORK5CYII="),
      _size: ko({ width: 25, height: 20 }),
    };
  };


  var Project = {};

  Project.new = function() {
    var sprite = Project.newSprite();

    var project = {
      objName: ko('Stage'),
      _isStage: true,
      _hasErrors: ko(false),

      _fileName: '',

      children: ko([sprite]),
      sprites: ko([sprite]), // !

      scripts: [],
      scriptComments: [],

      variables: ko([]),
      lists: ko([]),

      costumes: ko([backdrop()]),
      currentCostumeIndex: ko(0),
      sounds: ko([]),

      penLayerMD5: '5c81a336fab8be57adc039a8a2b33ca9.png',
      penLayerID: 0,
      tempoBPM: 60,
      videoAlpha: 0.5,
      info: {
        videoOn: false,
        spriteCount: 1, // goes stale
        scriptCount: 0, // goes stale
      },
    };

    project._spriteNames = project.sprites.map(getName);

    return project;
  };

  Project.newSprite = function() {
    var sprite = {
      objName: ko('turtle'),
      indexInLibrary: 1, // goes stale
      _hasErrors: ko(false),
      _editingName: ko(false),

      scripts: [],
      scriptComments: [],

      variables: ko([]),
      lists: ko([]),

      costumes: ko([turtle()]),
      currentCostumeIndex: ko(0),
      sounds: ko([]),

      scratchX: 0,
      scratchY: 0,
      scale: 1,
      direction: 90,
      rotationStyle: 'normal',
      isDraggable: false,
      visible: true,
      spriteInfo: {},
    };
    return sprite;
  };

  Project.newVariable = function(name) {
    var name = ko(name || "");
    return {
      name: name,
      _name: name,
      value: 0,
      isPersistent: false,
      _isEditing: ko(false),
    };
  };

  Project.newList = function(name) {
    var name = ko(name || "");
    return {
      listName: name,
      _name: name,
      contents: [],
      isPersistent: false,
      x: 5,
      y: 5,
      width: 102,
      height: 202,
      visible: false,
      _isEditing: ko(false),
    };
  };

  Project.newCostume = function(name, ext, ab) {
    var details = loadImage(ext, arrayBufferToBinary(ab));
    var costume = {
      name: ko(name),
      ext: ext,
      file: ab,
      bitmapResolution: 1,
      rotationCenterX: 0,
      rotationCenterY: 0,
      _src: details.src,
      _size: details.size,
    };
    details.size.subscribe(function(size) {
      if (!size) return;
      // TODO bitmapResolution ??
      costume.rotationCenterX = size.width / 2;
      costume.rotationCenterY = size.height / 2;
    });
    return costume;
  };

  Project.newSound = function(name, ext, ab) {
    var $sound = audioFromFile(ext, arrayBufferToBinary(ab));
    return {
      name: ko(name),
      ext: ext,
      file: ab,
      // sampleCount: 0, // TODO
      // rate: 0,
      // format: "",
      _$audio: $audio,
    };
  };


  /* load */

  Project.load = function(zip) {
    var p = P.IO.parseJSONish(zip.file('project.json').asText());

    // build sprites array
    p.sprites = p.children.filter(function(x) { return !!x.objName; });
    p.sprites.sort(function(a, b) {
      return a.indexInLibrary < b.indexInLibrary ? -1 :
             a.indexInLibrary > b.indexInLibrary ? +1 : 0;
    });
    p.sprites.forEach(function(s) {
      s.objName = ko(s.objName);
    });
    p.sprites = ko(p.sprites);
    p.children = ko(p.children);

    p._spriteNames = p.sprites.map(getName);

    p._isStage = true;

    var n = 0;

    var scriptableMappings = {};

    // before renaming
    var stageOldVariables = {};
    var stageOldLists = {};
    // after renaming
    var stageSeen = {};

    [p].concat(p.sprites()).forEach(function(s) {
      // ensure properties are present
      s.scripts = s.scripts || [];
      s.scriptComments = s.scriptComments || [];

      s.variables = ko(s.variables || []);
      s.lists = ko(s.lists || []);

      // UI-only properties
      s._hasErrors = ko(false);
      s._editingName = ko(false); 

      // koel-ify attrs
      s.objName = ko(s.objName);
      var costumeIndex = s.currentCostumeIndex;
      if (!costumeIndex || costumeIndex < 0 || costumeIndex >= s.costumes.length) {
        costumeIndex = 0;
      }
      s.currentCostumeIndex = ko(costumeIndex);

      // sort scripts
      s.scripts.sort(function(a, b) {
        var ax = a[0], ay = a[1], bx = b[0], by = b[1];
        return ay > by ? +1 : ay < by ? -1
             : ax > bx ? +1 : ax < bx ? -1 : 0;
      });

      // koel-ify variables & lists
      s.variables().forEach(function(variable) {
        variable._name = variable.name = ko(variable.name);
        variable._isEditing = ko(false);
      });

      var listsByName = {};
      s.lists().forEach(function(list) {
        list._name = list.listName = ko(list.listName);
        list._isEditing = ko(false);
      });

      var oldVariables = {};
      var oldLists = {};
      if (s === p) {
        stageOldVariables = oldVariables;
        stageOldLists = oldLists;
      }
      s.variables().forEach(function(variable) {
        oldVariables[variable._name()] = true;
      });
      s.lists().forEach(function(list) {
        oldLists[list._name()] = true;
      });

      // look for & create undefined variables & lists
      var customBlocks = s._customBlocks = {};
      s.scripts.forEach(function(script) {
        function mapping(kind, name, target) {
          if (target) return;
          if (kind === 'parameter') return;
          if (name.constructor === Array) return;

          // we create them on this scriptable, because that's what scratch does
          if (kind === 'variable') {
            if (!oldVariables.hasOwnProperty(name) && !stageOldVariables.hasOwnProperty(name)) {
              var variable = Project.newVariable();
              variable._name.assign(name);
              s.variables.push(variable);
              oldVariables[name] = variable;
            }
          } else if (kind === 'list') {
            if (!oldLists.hasOwnProperty(name) && !stageOldLists.hasOwnProperty(name)) {
              var list = Project.newList();
              list._name.assign(name);
              s.lists.push(list);
              oldLists[name] = list;
            }
          } else if (kind === 'custom') {
            // cleans *spec*, not parameter names. those come later
            customBlocks[name] = Language.cleanName('custom', name, {}, {});
          }
        }
        Compiler.renameInScript(mapping, script);
      });

      // validate variable, list, and parameter names
      var details = {
        variable: {},
        list: {},
        definitions: {},
      };
      var target = s.objName();
      var seen = {};
      s._seen = seen;
      if (s === p) {
        target = "_stage_";
        stageSeen = seen;
      }
      s.variables().forEach(function(variable) {
        var name = variable._name();
        var newName = Language.cleanName('variable', name, seen, stageSeen);
        seen[newName] = true;
        details.variable[name] = newName;
        variable._name.assign(newName);
      });
      s.lists().forEach(function(list) {
        var name = list._name();
        var newName = Language.cleanName('list', name, seen, stageSeen);
        seen[newName] = true;
        details.list[name] = newName;
        list._name.assign(newName);
      });
      // TODO definition parameters
      scriptableMappings[target] = details;

      // load costumes
      s.costumes = ko(s.costumes || []);
      s.costumes().forEach(function(costume) {
        var ext = costume.baseLayerMD5.split('.').pop(),
            root = costume.baseLayerID + '.';

        // load file
        var f = zip.file(root + ext);
        if (!f) { ext = 'png'; f = zip.file(root + ext); }
        if (!f) { ext = 'jpg'; f = zip.file(root + ext); }
        if (!f) { ext = 'svg'; f = zip.file(root + ext); }
        assert(f, "Couldn't find image: " + root + ext);
        costume.file = f.asArrayBuffer();
        costume.ext = ext;
        delete costume.baseLayerID;

        // make <image> element
        var details = loadImage(ext, f.asBinary());
        costume._src = details.src;
        costume._size = details.size;

        // load textLayer file
        if (costume.textLayerID) {
          if (costume.textLayerID !== -1) {
            root = costume.textLayerID + '.';
            f = zip.file(root + ext);
            if (!f) { ext = 'png'; f = zip.file(root + ext); }
            assert(f, "Couldn't find text layer: " + root + ext);
            costume.textFile = f.asArrayBuffer();
            costume.textExt = ext;
          }
          delete costume.textLayerID;
        }

        // fixup `name` property
        costume.name = ko(costume.costumeName);
        delete costume.costumeName;
      });

      // load sounds
      s.sounds = ko(s.sounds || []);
      s.sounds().forEach(function(sound) {
        var ext = sound.md5.split('.').pop() || 'wav',
            filename = sound.soundID + '.' + ext;

        // load file
        var f = zip.file(filename);
        sound.file = f.asArrayBuffer();
        sound.ext = ext;

        // make <audio> element
        sound._$audio = audioFromFile(ext, f.asBinary());

        // fixup `name` property
        sound.name = ko(sound.soundName);
        delete sound.soundID;
        delete sound.md5;
      });
    });


    // automatic variable/list/parameter renaming

    [p].concat(p.sprites()).forEach(function(s) {
      var defaultTarget = s === p ? "_stage_" : s.objName();
      var seen = s._seen;
      var customBlocks = s._customBlocks;

      var rename = function(defineSpec, kind, name, target) {
        var target = target || defaultTarget;

        var details = scriptableMappings[target];
        if (!details) return name;
        var mapping = details[kind];

        var result;
        if (kind === 'parameter') {
          mapping = mapping[defineSpec];
          if (!mapping) return;
          result = mapping[name];
        } else if (kind === 'custom') {
          return customBlocks[name];
        } else {
          if (!mapping[name]) {
            details = scriptableMappings["_stage_"];
            mapping = details[kind];
          }
          result = mapping[name];
        }

        if (!result) return name;
        return result;
      };

      s.scripts = s.scripts.map(function(script) {
        var blocks = script[2];
        var firstBlock = blocks[0];

        var spec = null;
        var parameters = {};
        if (firstBlock[0] === 'procDef') {
          spec = firstBlock[1];
          var names = firstBlock[2];
          names.forEach(function(name) {
            var newName = Language.cleanName('parameter', name, seen, stageSeen);
            parameters[name] = newName;
          });
        }

        var mapping = function(kind, name, target) {
          if (kind === 'parameter') {
            return parameters[name] || name;
          }

          return rename(spec, kind, name, target);
        };
        return Compiler.renameInScript(mapping, script);
      });

      delete s._seen;
      delete s._customBlocks;
    });

    // rename watchers too

    p.children().forEach(function(obj) {
      if (obj.objName) return; // that's a sprite
      var target = obj.target;
      if (!target) return; // that's not a watcher
      target = target === "Stage" ? "_stage_" : target;

      if (obj.cmd === 'getVar:') {
        var details = scriptableMappings[target];
        if (!details) return;
        var mapping = details.variable;

        var name = obj.param;
        name = mapping[name] || name;
        obj.param = name;
        obj.label = target === "_stage_" ? name : target + ": " + name;
      }
    });

    return p;
  };

  /* save */

  Project.copyForSave = function(p) {
    function copy(v) {
      if (!v) return v;
      if (ko.isObservable(v)) {
        v = v(); // specific to this
      }
      if (v && v.constructor === Array) {
        return v.map(copy);
      } else if (v.constructor === Object) {
        var d = {};
        Object.keys(v).forEach(function(k) {
          if (/^_/.test(k)) return;
          d[k] = copy(v[k]);
        });
        return d;
      }
      return v;
    }

    return copy(p);
  };

  Project.save = function(p) {
    // refresh stale things
    p.sprites().forEach(function(s, index) {
      s.indexInLibrary = index + 1;
    });

    // count sprites & scripts
    p.info.spriteCount = p.sprites().length;
    p.info.scriptCount = sum([p].concat(p.sprites()).map(function(obj) {
      return obj.scripts.length;
    }));

    // copy everything
    var p = Project.copyForSave(p);
    var zip = new JSZip();

    // throw away `sprites` array
    delete p.sprites;

    // save assets
    var highestCostumeId = 0;
    var highestSoundId = 0;
    [p].concat(p.children).forEach(function(s) {

      if (!s.objName) return;

      // save costumes
      s.costumes.forEach(function(costume) {
        // fixup `name` property
        costume.costumeName = costume.name;
        delete costume.name;

        // store file
        costume.baseLayerID = highestCostumeId++;
        costume.baseLayerMD5 = costume.baseLayerMD5 || '';
        var filename = costume.baseLayerID + '.' + costume.ext;
        zip.file(filename, costume.file);
        delete costume.ext;
        delete costume.file;

        // store textLayer too
        if (costume.textFile) {
          costume.textLayerID = highestCostumeId++;
          var filename = costume.textLayerID + '.' + costume.textExt;
          zip.file(filename, costume.textFile);
          delete costume.textFile;
          delete costume.textExt;
        }
      });

      // save costumes
      s.sounds.forEach(function(sound) {
        // fixup `name` property
        sound.soundName = sound.name;
        delete sound.name;

        // store file
        sound.soundID = highestSoundId++;
        sound.md5 = '';
        var filename = sound.soundID + '.' + sound.ext;
        zip.file(filename, sound.file);
        delete sound.ext;
        delete sound.file;
      });

      // fixup names
      s.variables = fixNameObjects(s.variables);
      s.lists = fixNameObjects(s.lists);

      // TODO set persistent if cloud ☁ in name

    });

    // store json
    zip.file('project.json', JSON.stringify(p));

    return zip;
  };

  function fixNameObjects(objects) {
    var seen = {};
    var result = [];
    for (var i=0; i<objects.length; i++) {
      var obj = objects[i];
      var name = obj.name || obj.listName;
      if (!name) continue;
      if (seen.hasOwnProperty(name)) continue;
      result.push(obj);
      seen[name] = true;
    }
    return result;
  }

  /***************************************************************************/

  return {
    Project: Project,
    binaryToArrayBuffer: binaryToArrayBuffer,
  };

}());

export default Format;
