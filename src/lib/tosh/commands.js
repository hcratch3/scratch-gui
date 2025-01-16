export var Scratch = (function() {

  



  /* define Scratch blocks */

  var categoriesById = {
    1:  "motion",
    2:  "looks",
    3:  "sound",
    4:  "pen",
    5:  "events",
    6:  "control",
    7:  "sensing",
    8:  "operators",
    9:  "variable",
    10: "custom",
    11: "parameter",
    12: "list",
    20: "extension",
    42: "grey",
  };

  var blocks = [];
  var blocksBySelector = {};

  var inputPat = /(%[a-zA-Z](?:\.[a-zA-Z]+)?)/g;

  scratchCommands.push(["%m.var", "r", 9, "readVariable"]);
  scratchCommands.push(["%m.list", "r", 12, "contentsOfList:"]);
  scratchCommands.push(["%m.param", "r", 11, "getParam"]);
  scratchCommands.push(["%m.param", "b", 11, "getParam"]);
  scratchCommands.push(["else", "else", 6, "else"]);
  scratchCommands.push(["end", "end", 6, "end"]);
  scratchCommands.push(["...", "ellips", 42, "ellips"]);

  var typeShapes = {
    ' ': 'stack',
    'b': 'predicate',
    'c': 'c-block',
    'e': 'if-block',
    'f': 'cap',
    'h': 'hat',
    'r': 'reporter',
    'cf': 'c-block cap',

    'else': 'else',
    'end': 'end',
    'ellips': 'ellips',
  };

  scratchCommands.forEach(function(command) {
    var spec = command[0];
    if (spec === 'set pen color to %n') {
      spec = 'set pen hue to %n';
    } else if (spec === 'change pen color by %n') {
      spec = 'change pen hue by %n';
    }
    var block = {
      spec: spec,
      parts: spec.split(inputPat),
      shape: typeShapes[command[1]], // /[ bcefhr]|cf/
      category: categoriesById[command[2] % 100],
      selector: command[3],
      defaults: command.slice(4),
    };
    block.inputs = block.parts.filter(function(p) { return inputPat.test(p); });
    blocks.push(block);
    if (block.selector !== 'getParam') assert(!blocksBySelector[block.selector], block.selector);
    blocksBySelector[block.selector] = block;
  });

  /* this keeps format.js happy */

  var inputShapes = {
    '%b': 'boolean',
    '%c': 'color',
    '%d': 'number-menu',
    '%m': 'readonly-menu',
    '%n': 'number',
    '%s': 'string',
  }

  var getInputShape = function(input) {
    var s = input.slice(0, 2)
    return inputShapes[s];
  };

  /* alternative info for stop block */

  var osisInfo = {
    category: "control",
    defaults: ["all"],
    inputs: ["%m.stop"],
    parts: ["stop", "%m.stop", ""],
    selector: "stopScripts",
    shape: "stack",
    spec: "stop %m.stop",
  };


  return {
    blocks: blocks,
    blocksBySelector: blocksBySelector,
    inputPat: inputPat,
    getInputShape: getInputShape,

    stopOtherScripts: osisInfo,
  };

}());
