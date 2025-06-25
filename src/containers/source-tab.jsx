import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

// CodeMirror 6のモジュールを直接インポート
import { Extension, EditorState } from "@codemirror/state";
import {
  EditorView, keymap, highlightSpecialChars, drawSelection,
  highlightActiveLine, dropCursor, rectangularSelection,
  crosshairCursor, lineNumbers, highlightActiveLineGutter
} from "@codemirror/view";
import {
  defaultHighlightStyle, syntaxHighlighting, indentOnInput,
  bracketMatching, foldGutter, foldKeymap
} from "@codemirror/language";
import {
  defaultKeymap, history, historyKeymap, undo, redo,
  copySelected, cutSelected
} from "@codemirror/commands";
import {
  searchKeymap, highlightSelectionMatches, startSearch
} from "@codemirror/search";
import {
  autocompletion, completionKeymap, closeBrackets,
  closeBracketsKeymap
} from "@codemirror/autocomplete";
import {lintKeymap} from "@codemirror/lint";

import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "codemirror/theme-one-dark";

import styles from '../components/source/source.css';
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

// --- decompileBlockToJs 関数は、今回は直接使用しませんが、削除せず残しておきます ---
/**
 * Scratch 3.0のブロックデータをJavaScript風のコードに変換するデコンパイラ。
 * これは簡略化された実装であり、全てのブロックタイプや複雑な構造に対応するものではありません。
 *
 * @param {object | Map<string, Object>} blocksMap - VMから取得したブロックIDをキーとするブロックオブジェクトのMapまたはプレーンオブジェクト
 * @param {string} startBlockId - スクリプトの開始ブロックのID (通常はハットブロック)
 * @param {number} indentLevel - 現在のインデントレベル
 * @returns {string} 生成されたJavaScript風のコード文字列
 */
const decompileBlockToJs = (blocksMap, startBlockId, indentLevel = 0) => {
    let code = '';
    // 修正: blocksMapがMapかオブジェクトかに応じてgetまたはブラケット記法を使用
    const getBlockById = (map, id) => {
        if (!map || !id) return null;
        if (map instanceof Map) {
            return map.get(id);
        } else if (typeof map === 'object') {
            return map[id];
        }
        return null;
    };

    let currentBlock = getBlockById(blocksMap, startBlockId);
    const indent = '\t'.repeat(indentLevel);

    // ヘルパー関数: 入力ブロックまたはフィールドの値を解決
    const resolveInput = (input) => {
        if (!input) return 'undefined';

        // 値ブロック（VALUE, VARIABLE, LIST, BROADCAST_MESSAGE）
        if (input.block) {
            const connectedBlock = getBlockById(blocksMap, input.block); // 修正: getBlockByIdを使用
            if (connectedBlock) {
                return decompileBlockToJs(blocksMap, connectedBlock.id, 0); // 入れ子ブロックはインデントなしで解決
            }
        }
        // シャドウブロック（非接続の値）やフィールド
        if (input.shadow) {
            const shadowBlock = getBlockById(blocksMap, input.shadow); // 修正: getBlockByIdを使用
            if (shadowBlock && shadowBlock.fields && shadowBlock.fields.TEXT) {
                // シャドウブロックの値を取得 (例: sayブロックの初期テキスト)
                return JSON.stringify(shadowBlock.fields.TEXT.value);
            }
        }
        if (input.fields && input.fields.VARIABLE) {
            return JSON.stringify(input.fields.VARIABLE.value); // 変数の名前を文字列として取得
        }
        // デフォルトのフィールド値（数字、文字列など）
        if (input.value !== undefined) { // フィールドの直接的な値 (例: motion_movestepsのステップ数)
            return JSON.stringify(input.value); // 数値も文字列として扱えるようJSON.stringify
        }
        return 'null'; // 解決できない場合はnull
    };

    // ヘルパー関数: フィールドの値を解決
    const resolveField = (field) => {
        if (!field) return 'undefined';
        if (field.value !== undefined) {
            // 文字列の場合はクォートを付け、それ以外はそのまま
            return typeof field.value === 'string' ? JSON.stringify(field.value) : field.value;
        }
        return 'null';
    };

    while (currentBlock) {
        let line = indent;
        const opcode = currentBlock.opcode;
        const inputs = currentBlock.inputs || {};
        const fields = currentBlock.fields || {};

        switch (opcode) {
            // --- イベントブロック ---
            case 'event_whenflagclicked':
                line += `whenGreenFlagClicked(() => {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}});`;
                currentBlock = null; // ハットブロックなので次はない
                break;
            case 'event_whenkeypressed':
                line += `whenKeyPressed(${resolveField(fields.KEY_OPTION)}, () => {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}});`;
                currentBlock = null;
                break;
            case 'event_whenthisspriteclicked':
                line += `whenSpriteClicked(() => {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}});`;
                currentBlock = null;
                break;
            case 'event_whenbroadcastreceived':
                line += `whenIReceive(${resolveField(fields.BROADCAST_OPTION)}, () => {\n`;
                line += decompileBlockToJs(blocksMap, currentBlock.next, indentLevel + 1);
                line += `${indent}});`;
                currentBlock = null;
                break;

            // --- 動きブロック ---
            case 'motion_movesteps':
                line += `move(${resolveInput(inputs.STEPS)}) steps;`;
                break;
            case 'motion_turnright':
                line += `turnRight(${resolveInput(inputs.DEGREES)}) degrees;`;
                break;
            case 'motion_turnleft':
                line += `turnLeft(${resolveInput(inputs.DEGREES)}) degrees;`;
                break;
            case 'motion_goto':
                line += `goTo(${resolveInput(inputs.TO)});`; // 例: mouse-pointer, random position, sprite name
                break;
            case 'motion_gotoxy':
                line += `goToX(${resolveInput(inputs.X)}), Y(${resolveInput(inputs.Y)});`;
                break;
            case 'motion_changexby':
                line += `changeXby(${resolveInput(inputs.DX)});`;
                break;
            case 'motion_setx':
                line += `setXto(${resolveInput(inputs.X)});`;
                break;
            case 'motion_changeyby':
                line += `changeYby(${resolveInput(inputs.DY)});`;
                break;
            case 'motion_sety':
                line += `setYto(${resolveInput(inputs.Y)});`;
                break;

            // --- 見た目ブロック ---
            case 'looks_sayforsecs':
                line += `say(${resolveInput(inputs.MESSAGE)}) for ${resolveInput(inputs.SECS)} secs;`;
                break;
            case 'looks_say':
                line += `say(${resolveInput(inputs.MESSAGE)});`;
                break;
            case 'looks_thinkforsecs':
                line += `think(${resolveInput(inputs.MESSAGE)}) for ${resolveInput(inputs.SECS)} secs;`;
                break;
            case 'looks_think':
                line += `think(${resolveInput(inputs.MESSAGE)});`;
                break;
            case 'looks_show':
                line += `show();`;
                break;
            case 'looks_hide':
                line += `hide();`;
                break;
            case 'looks_nextcostume':
                line += `nextCostume();`;
                break;
            case 'looks_switchcostumeto':
                line += `switchCostumeTo(${resolveField(fields.COSTUME)});`;
                break;

            // --- 制御ブロック ---
            case 'control_wait':
                line += `wait(${resolveInput(inputs.DURATION)}) seconds;`;
                break;
            case 'control_repeat':
                line += `repeat(${resolveInput(inputs.TIMES)}, () => {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1); // SUBSTACKの中身
                line += `${indent}});`;
                break;
            case 'control_forever':
                line += `forever(() => {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1);
                line += `${indent}});`;
                break;
            case 'control_if':
                line += `if (${decompileBlockToJs(blocksMap, inputs.CONDITION.block, 0)}) {\n`; // CONDITIONは別途解決
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1);
                line += `${indent}}`;
                break;
            case 'control_if_else':
                line += `if (${decompileBlockToJs(blocksMap, inputs.CONDITION.block, 0)}) {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK.block, indentLevel + 1);
                line += `${indent}} else {\n`;
                line += decompileBlockToJs(blocksMap, inputs.SUBSTACK2.block, indentLevel + 1); // SUBSTACK2
                line += `${indent}}`;
                break;
            
            // --- 演算ブロック ---
            case 'operator_add':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} + ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_subtract':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} - ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_multiply':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} * ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_divide':
                line += `(${decompileBlockToJs(blocksMap, inputs.NUM1.block, 0)} / ${decompileBlockToJs(blocksMap, inputs.NUM2.block, 0)})`;
                break;
            case 'operator_random':
                line += `random(${decompileBlockToJs(blocksMap, inputs.FROM.block, 0)}, ${decompileBlockToJs(blocksMap, inputs.TO.block, 0)})`;
                break;
            case 'operator_gt':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} > ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_lt':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} < ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_equals':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} === ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_and':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} && ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_or':
                line += `(${decompileBlockToJs(blocksMap, inputs.OPERAND1.block, 0)} || ${decompileBlockToJs(blocksMap, inputs.OPERAND2.block, 0)})`;
                break;
            case 'operator_not':
                line += `!(${decompileBlockToJs(blocksMap, inputs.OPERAND.block, 0)})`;
                break;
            case 'operator_join':
                line += `\`\$\{${decompileBlockToJs(blocksMap, inputs.STRING1.block, 0)}\}\$\{${decompileBlockToJs(blocksMap, inputs.STRING2.block, 0)}\}\``;
                break;

            // --- 変数ブロック ---
            case 'data_setvariableto':
                line += `setVariable(${resolveField(fields.VARIABLE)}, ${resolveInput(inputs.VALUE)});`;
                break;
            case 'data_changevariableby':
                line += `changeVariableBy(${resolveField(fields.VARIABLE)}, ${resolveInput(inputs.VALUE)});`;
                break;
            case 'data_variable': // 変数名を取得
                line += `${resolveField(fields.VARIABLE)}`;
                break;
            
            // --- その他 ---
            case 'sensing_askandwait':
                line += `ask(${resolveInput(inputs.QUESTION)});`;
                break;
            case 'sensing_answer':
                line += `answer`;
                break;
            case 'looks_backdropname':
                line += `backdropName`; // レポーターブロック
                break;
            case 'looks_costume':
                line += `costumeName`; // レポーターブロック
                break;
            case 'motion_xposition':
                line += `xPosition`; // レポーターブロック
                break;
            case 'motion_yposition':
                line += `yPosition`; // レポーターブロック
                break;
            case 'motion_direction':
                line += `direction`; // レポーターブロック
                break;

            default:
                // 未対応のブロックはJSON形式で出力するか、コメントアウト
                line += `// Unsupported Block: ${opcode} ${JSON.stringify(currentBlock, null, 2).replace(/\n/g, `\n${indent}// `)}`;
                break;
        }

        code += line + '\n';
        if (currentBlock && currentBlock.next) {
            currentBlock = getBlockById(blocksMap, currentBlock.next); // 修正: getBlockByIdを使用
        } else {
            currentBlock = null;
        }
    }
    return code;
};


const SourceTab = (props) => {
    const editorRef = useRef(null);
    const editorInstance = useRef(null);

    const [spriteCode, setSpriteCode] = useState(() => {
        const codeMap = {};
        Object.keys(props.sprites).forEach((spriteId) => {
            codeMap[spriteId] = '';
        });
        if (props.stage) {
            codeMap[props.stage.id] = '';
        }
        return codeMap;
    });

    const [selectedSpriteId, setSelectedSpriteId] = useState(props.editingTarget);
    
    // Scratchブロックに対応するカスタム補完項目を定義 (変更なし)
    const scratchCompletions = useCallback((context) => {
        const word = context.matchBefore(/\w*/);
        if (!word.from || word.from === word.to && !context.explicit) {
            return null;
        }

        const defaultCompletions = [
            { label: "move", type: "function", info: "スプライトを移動します (例: move(10) steps;)" },
            { label: "turnRight", type: "function", info: "スプライトを右に回転します (例: turnRight(15) degrees;)" },
            { label: "turnLeft", type: "function", info: "スプライトを左に回転します (例: turnLeft(15) degrees;)" },
            { label: "say", type: "function", info: "スプライトが言います (例: say('Hello!');)" },
            { label: "think", type: "function", info: "スプライトが考えます (例: think('Hmm...');)" },
            { label: "whenGreenFlagClicked", type: "function", info: "緑の旗がクリックされたときに実行 (例: whenGreenFlagClicked(() => { ... });)" },
            { label: "forever", type: "keyword", info: "繰り返しのループ (例: forever(() => { ... });)" },
            { label: "if", type: "keyword", info: "条件分岐 (例: if (condition) { ... } else { ... };)" },
            { label: "else", type: "keyword", info: "条件分岐 (ifと合わせて使用)" },
            { label: "repeat", type: "function", info: "指定回数繰り返す (例: repeat(10, () => { ... });)" },
            { label: "glide", type: "function", info: "指定位置へ滑らかに移動 (例: glide(1, x, y);)" },
            { label: "goTo", type: "function", info: "指定位置へ移動 (例: goTo(x, y);)" },
            { label: "changeXby", type: "function", info: "X座標を変更 (例: changeXby(10);)" },
            { label: "changeYby", type: "function", info: "Y座標を変更 (例: changeYby(10);)" },
            { label: "setXto", type: "function", info: "X座標を設定 (例: setXto(0);)" },
            { label: "setYto", type: "function", info: "Y座標を設定 (例: setYto(0);)" },
            { label: "show", type: "function", info: "表示する (例: show();)" },
            { label: "hide", type: "function", info: "隠す (例: hide();)" },
            { label: "nextCostume", type: "function", info: "次のコスチューム (例: nextCostume();)" },
            { label: "switchCostumeTo", type: "function", info: "コスチュームを切り替える (例: switchCostumeTo('costume1');)" },
            { label: "wait", type: "function", info: "待つ (例: wait(1) seconds;)" },
            { label: "broadcast", type: "function", info: "メッセージを送る (例: broadcast('message1');)" },
            { label: "whenIReceive", type: "function", info: "メッセージを受け取ったとき (例: whenIReceive('message1', () => { ... });)" },
            { label: "setVariable", type: "function", info: "変数を設定する (例: setVariable('myVar', 0);)" },
            { label: "changeVariableBy", type: "function", info: "変数を変更する (例: changeVariableBy('myVar', 1);)" },
            { label: "sprite", type: "keyword", info: "スプライト定義の開始" },
            { label: "stage", type: "keyword", info: "ステージ定義の開始" },
            { label: "clone", type: "function", info: "クローンを作成" },
            { label: "deleteThisClone", type: "function", info: "このクローンを削除" },
            { label: "touching", type: "function", info: "タッチ判定 (例: touching('mouse-pointer');)" },
            { label: "distanceTo", type: "function", info: "距離を測定 (例: distanceTo('sprite1');)" },
            { label: "ask", type: "function", info: "質問する (例: ask('What\'s your name?');)" },
            { label: "answer", type: "variable", info: "質問の答え" },
            { label: "random", type: "function", info: "乱数を生成 (例: random(1, 10);)" },
        ];

        const allCompletions = defaultCompletions;

        const filteredCompletions = allCompletions.filter(item =>
            item.label.toLowerCase().startsWith(word.text.toLowerCase())
        );

        return {
            from: word.from,
            options: filteredCompletions
        };
    }, []);


    // エディタの初期化とクリーンアップ (変更なし)
    useEffect(() => {
        const initializeEditor = () => {
            if (!editorRef.current) {
                return;
            }

            const initialDoc = ''; 
            const extensions = [
                lineNumbers(),
                foldGutter(),
                highlightSpecialChars(),
                history(),
                drawSelection(),
                dropCursor(),
                EditorState.allowMultipleSelections.of(true),
                indentOnInput(),
                syntaxHighlighting(defaultHighlightStyle),
                bracketMatching(),
                closeBrackets(),
                autocompletion({ override: [scratchCompletions] }),
                rectangularSelection(),
                crosshairCursor(),
                highlightActiveLine(),
                highlightActiveLineGutter(),
                highlightSelectionMatches(),
                javascript(), // JavaScriptシンタックスハイライトを使用
                oneDark,
                EditorView.lineWrapping,
                keymap.of([
                    ...closeBracketsKeymap,
                    ...defaultKeymap,
                    ...searchKeymap,
                    ...historyKeymap,
                    ...foldKeymap,
                    ...completionKeymap,
                    ...lintKeymap
                ]),
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        handleCodeChange(update.state.doc.toString());
                    }
                })
            ];

            const startState = EditorState.create({
                doc: initialDoc,
                extensions: extensions
            });

            const view = new EditorView({
                state: startState,
                parent: editorRef.current
            });

            editorInstance.current = view;
            console.log("CodeMirror 6 Multi-feature editor initialized.");
        };

        if (!editorInstance.current) {
            initializeEditor();
        }

        return () => {
            if (editorInstance.current) {
                console.log("CodeMirror 6 editor destroyed.");
                editorInstance.current.destroy();
                editorInstance.current = null;
            }
        };
    }, [scratchCompletions]);

    const handleCodeChange = useCallback((newCode) => {
        setSpriteCode(prevCodeMap => ({
            ...prevCodeMap,
            [selectedSpriteId]: newCode
        }));
    }, [selectedSpriteId]);

    // selectedSpriteId の変更を監視 (propsからstateへの同期) (変更なし)
    useEffect(() => {
        if (props.editingTarget !== selectedSpriteId) {
            setSelectedSpriteId(props.editingTarget);
        }
    }, [props.editingTarget, selectedSpriteId]);

    // ★修正: Scratch 3.0ブロックデータをそのままコンソールログに出力するロジック
    useEffect(() => {
        if (!props.vm || !selectedSpriteId) {
            return;
        }

        try {
            const target = props.vm.runtime.getTargetById(selectedSpriteId);
            if (target && target.blocks) {
                const blocksMap = target.blocks._blocks; 
                
                // blocksMapの形式をチェックし、適切にログに出力
                if (blocksMap instanceof Map) {
                    console.log("--- Raw Blocks Data (Map) ---");
                    console.log(blocksMap); // Mapオブジェクトをそのままログ
                    // MapをJSON文字列に変換してログ出力 (見やすいように)
                    const blocksObject = {};
                    blocksMap.forEach((block, id) => {
                        blocksObject[id] = block.toJSON();
                    });
                    console.log("--- Raw Blocks Data (JSON Stringified) ---");
                    console.log(JSON.stringify(blocksObject, null, 2));
                    console.log("----------------------------");
                    
                    // CodeMirrorには情報を出力した旨のメッセージを表示
                    if (editorInstance.current) {
                        const message = '// Scratch VMのブロックデータがコンソールにログ出力されました。\n// Please open your browser\'s developer console (F12) to view the raw block data.';
                        const currentEditorDoc = editorInstance.current.state.doc.toString();
                        if (currentEditorDoc !== message) {
                            editorInstance.current.dispatch({
                                changes: {
                                    from: 0,
                                    to: currentEditorDoc.length,
                                    insert: message
                                },
                            });
                        }
                    }

                } else if (typeof blocksMap === 'object' && blocksMap !== null) {
                    console.log("--- Raw Blocks Data (Plain Object) ---");
                    console.log(blocksMap); // プレーンオブジェクトをそのままログ
                    console.log("--- Raw Blocks Data (JSON Stringified) ---");
                    console.log(JSON.stringify(blocksMap, null, 2));
                    console.log("----------------------------");

                    // CodeMirrorには情報を出力した旨のメッセージを表示
                    if (editorInstance.current) {
                        const message = '// Scratch VMのブロックデータがコンソールにログ出力されました。\n// Please open your browser\'s developer console (F12) to view the raw block data.';
                        const currentEditorDoc = editorInstance.current.state.doc.toString();
                        if (currentEditorDoc !== message) {
                            editorInstance.current.dispatch({
                                changes: {
                                    from: 0,
                                    to: currentEditorDoc.length,
                                    insert: message
                                },
                            });
                        }
                    }

                } else {
                    console.warn("blocksMapはMapでもプレーンなオブジェクトでもありません:", blocksMap);
                    const errorMessage = `// エラー: ブロックデータが予期せぬ形式です。\n// 詳細: blocksMapがMapでもオブジェクトでもありません。\n// コンソールを確認してください。`;
                    if (editorInstance.current) {
                        const currentEditorDoc = editorInstance.current.state.doc.toString();
                        if (currentEditorDoc !== errorMessage) {
                            editorInstance.current.dispatch({
                                changes: {
                                    from: 0,
                                    to: currentEditorDoc.length,
                                    insert: errorMessage
                                },
                            });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('ブロックデータの取得またはログ出力中にエラーが発生しました:', error);
            const errorMessage = `// エラー: ブロックデータの取得またはログ出力中にエラーが発生しました。\n// 詳細: ${error.message}\n// コンソールを確認してください。`;
            if (editorInstance.current) {
                const currentEditorDoc = editorInstance.current.state.doc.toString();
                if (currentEditorDoc !== errorMessage) {
                    editorInstance.current.dispatch({
                        changes: {
                            from: 0,
                            to: currentEditorDoc.length,
                            insert: errorMessage
                        },
                    });
                }
            }
        }
    }, [selectedSpriteId, props.vm]); 

    // Update editor content when selectedSpriteId or spriteCode changes (unchanged)
    // このuseEffectは、デコンパイラによる自動更新と競合する可能性があるため、
    // 必要に応じてロジックの見直しや削除を検討してください。
    // 現状は、デコンパイラが優先されるように動作します。
    useEffect(() => {
        if (!editorInstance.current || !selectedSpriteId) {
            return;
        }

        const newCode = spriteCode[selectedSpriteId] || '';
        // ★今回はエディタ表示を固定メッセージにするため、この自動更新ロジックはコメントアウトします。
        // if (editorInstance.current.state.doc.toString() !== newCode) {
        //     editorInstance.current.dispatch({
        //         changes: {
        //             from: 0,
        //             to: editorInstance.current.state.doc.length,
        //             insert: newCode
        //         },
        //     });
        //     console.log(`Editor content updated for sprite ID ${selectedSpriteId}.`);
        // }
    }, [selectedSpriteId, spriteCode]);

    // Monitor changes to props.sprites or props.stage and update spriteCode (unchanged)
    useEffect(() => {
        const newCodeMap = {};
        let changed = false;

        Object.keys(props.sprites).forEach((spriteId) => {
            if (!(spriteId in spriteCode)) {
                changed = true;
            }
            newCodeMap[spriteId] = spriteCode[spriteId] || '';
        });
        if (props.stage) {
            if (!(props.stage.id in spriteCode)) {
                changed = true;
            }
            newCodeMap[props.stage.id] = spriteCode[props.stage.id] || '';
        }

        for (const id in spriteCode) {
            if (!(id in newCodeMap)) {
                delete spriteCode[id];
                changed = true;
            }
        }

        if (changed || Object.keys(newCodeMap).length !== Object.keys(spriteCode).length) {
            setSpriteCode(newCodeMap);
            console.log("Sprite list changed. Code map updated.");
        }
    }, [props.sprites, props.stage, spriteCode]);

    // Toolbar action handlers (unchanged)
    const handleUndo = useCallback(() => {
        if (editorInstance.current) {
            undo(editorInstance.current);
        }
    }, []);

    const handleRedo = useCallback(() => {
        if (editorInstance.current) {
            redo(editorInstance.current);
        }
    }, []);

    const handleCopy = useCallback(() => {
        if (editorInstance.current) {
            copySelected(editorInstance.current);
        }
    }, []);

    const handleCut = useCallback(() => {
        if (editorInstance.current) {
            cutSelected(editorInstance.current);
        }
    }, []);

    const handlePaste = useCallback(() => {
        console.warn("ペースト機能はブラウザのセキュリティ制約により、ボタンから直接実行できません。キーボードショートカット (Ctrl+V / Cmd+V) を使用してください。");
    }, []);

    const handleSearch = useCallback(() => {
        if (editorInstance.current) {
            startSearch(editorInstance.current);
        }
    }, []);

    const handleRunCompiledCode = useCallback(() => {
        if (editorInstance.current) {
            const currentCode = editorInstance.current.state.doc.toString();
            console.log("--- コンパイルされたJavaScriptコードの実行を試みます ---");
            console.log(currentCode);
            console.log("-------------------------------------------------");
            console.log("注意: このコードはブラウザのJavaScriptエンジンで実行されますが、");
            console.log("直接Scratch VMのスプライトやステージを操作するものではありません。");
            console.log("VMを操作するには、コンパイルされたJSとVMのAPIを橋渡しする");
            console.log("カスタムのバインディング層と安全な実行環境が必要です。");

            try {
                // new Function(currentCode)(); // セキュリティリスクに注意
            } catch (e) {
                console.error("JavaScriptコードの実行中にエラーが発生しました:", e);
            }
        }
    }, []);

    // コードをブロックに変換するハンドラ (限定的なデモンストレーション) (変更なし)
    const handleCompileToBlocks = useCallback(() => {
        if (editorInstance.current && props.vm) {
            const currentCode = editorInstance.current.state.doc.toString();
            try {
                const projectJSON = JSON.parse(currentCode);

                props.vm.loadProject(projectJSON)
                    .then(() => {
                        console.log("コードをScratchプロジェクトとしてVMにロードしました。");
                    })
                    .catch(e => {
                        console.error("Scratchプロジェクトのロードに失敗しました:", e);
                        alert(`プロジェクトのロードに失敗しました。\nエラー: ${e.message}\nエディタの内容が有効なScratchプロジェクトJSONであることを確認してください。`);
                    });

            } catch (e) {
                console.error("CodeMirrorの内容が有効なJSONではありません:", e);
                alert(`コードをブロックに変換できませんでした。\nエラー: ${e.message}\n有効なJSON形式のScratchプロジェクトデータが入力されているか確認してください。`);
            }
        }
    }, [props.vm]);


    if (!props.vm.editingTarget) {
        return null;
    }

    return (
        <div
            className={styles.source}
            ref={props.setRef}
            onMouseDown={props.onContainerClick}
        >
            {/* ツールバーコンテナ */}
            <div className="flex justify-center p-3 space-x-2 bg-gray-700 rounded-t-lg shadow-md">
                <button
                    onClick={handleSearch}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="検索 (Ctrl+F)"
                >
                    検索
                </button>
                <button
                    onClick={handleCopy}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="コピー (Ctrl+C)"
                >
                    コピー
                </button>
                <button
                    onClick={handleCut}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="カット (Ctrl+X)"
                >
                    カット
                </button>
                <button
                    onClick={handlePaste}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="ペースト (Ctrl+V / Cmd+V)"
                >
                    ペースト
                </button>
                <button
                    onClick={handleUndo}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="戻る (Ctrl+Z)"
                >
                    戻る
                </button>
                <button
                    onClick={handleRedo}
                    className="p-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="進む (Ctrl+Shift+Z)"
                >
                    進む
                </button>
                <button
                    onClick={handleRunCompiledCode}
                    className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-md shadow-sm transition-colors duration-200 ml-4"
                    title="コンパイルされたコードを実行 (コンソールに出力)"
                >
                    コードを実行
                </button>
                {/* 新規追加: コードをブロックに変換するボタン */}
                <button
                    onClick={handleCompileToBlocks}
                    className="p-2 bg-purple-500 hover:bg-purple-600 text-white rounded-md shadow-sm transition-colors duration-200"
                    title="コードをブロックに変換 (ScratchプロジェクトJSONとしてロード)"
                >
                    ブロックに変換
                </button>
            </div>

            {/* CodeMirrorエディタをマウントする場所 */}
            <div style={{ height: 'calc(100% - 50px)', width: '100%' }} className="rounded-b-lg overflow-hidden">
                <div ref={editorRef} className="codemirror-container w-full h-full" />
            </div>
        </div>
    );
};

SourceTab.propTypes = {
    editingTarget: PropTypes.string,
    sprites: PropTypes.object.isRequired,
    stage: PropTypes.object,
    setRef: PropTypes.func,
    onContainerClick: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = (state) => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    vm: state.scratchGui.vm
});

export default errorBoundaryHOC('Source Tab')(
    connect(mapStateToProps)(SourceTab)
);
