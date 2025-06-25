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
import { oneDark } from "@codemirror/theme-one-dark";

// tosh コンパイラは削除し、独自の変換ロジックを使用します
// import * as tosh from 'tosh';

import styles from '../components/source/source.css';
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

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
    const [customCommands, setCustomCommands] = useState([]);

    // `command.json` からカスタムコマンドをロードするuseEffect (変更なし)
    useEffect(() => {
        const loadCustomCommands = async () => {
            try {
                const response = await fetch('./command.json');
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const data = await response.json();
                const formattedCommands = data.commands.map(cmd => ({
                    label: cmd.label,
                    type: cmd.type || "keyword",
                    info: cmd.info || ""
                }));
                setCustomCommands(formattedCommands);
                console.log('カスタムコマンドをロードしました:', formattedCommands);
            } catch (error) {
                console.error('カスタムコマンドのロードに失敗しました:', error);
                setCustomCommands([]);
            }
        };
        loadCustomCommands();
    }, []);

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

        const allCompletions = [...defaultCompletions, ...customCommands];

        const filteredCompletions = allCompletions.filter(item =>
            item.label.toLowerCase().startsWith(word.text.toLowerCase())
        );

        return {
            from: word.from,
            options: filteredCompletions
        };
    }, [customCommands]);

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
                javascript(),
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
            console.log("CodeMirror 6 多機能エディターが初期化されました。");
        };

        if (!editorInstance.current) {
            initializeEditor();
        }

        return () => {
            if (editorInstance.current) {
                console.log("CodeMirror 6 エディターを破棄します。");
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

    // `tosh` の代わりにScratch 3.0のブロックをJSON文字列として表示するロジック
    useEffect(() => {
        if (!props.vm || !selectedSpriteId) {
            return;
        }

        try {
            const target = props.vm.runtime.getTargetById(selectedSpriteId);
            if (target && target.blocks) {
                const blocksMap = target.blocks.getBlocks();
                const blocksObject = {};
                blocksMap.forEach((block, id) => {
                    blocksObject[id] = block.toJSON();
                });

                // tosh の代わり: Scratch 3.0のブロックJSONを整形して表示
                // ここに本格的なScratch 3.0 -> JavaScriptコンパイラを統合する必要があります
                const generatedCode = JSON.stringify(blocksObject, null, 2); // JSONを整形して文字列化

                if (editorInstance.current) {
                    const currentEditorDoc = editorInstance.current.state.doc.toString();
                    if (currentEditorDoc !== generatedCode) { // 変更がある場合のみ更新
                        editorInstance.current.dispatch({
                            changes: {
                                from: 0,
                                to: currentEditorDoc.length,
                                insert: generatedCode
                            },
                        });
                        console.log(`Scratch 3.0のブロックJSONをエディタに表示しました。`);
                    }
                }
                setSpriteCode(prevCodeMap => ({
                    ...prevCodeMap,
                    [selectedSpriteId]: generatedCode
                }));

            }
        } catch (error) {
            console.error('ブロックデータの処理中にエラーが発生しました:', error);
            if (editorInstance.current) {
                editorInstance.current.dispatch({
                    changes: {
                        from: 0,
                        to: editorInstance.current.state.doc.length, // .length は .doc.length に修正
                        insert: `// エラー: ブロックデータの処理に失敗しました。\n// 詳細: ${error.message}\n// Scratch 3.0のブロックをJavaScriptにコンパイルするには、適切なコンパイラが必要です。\n`
                    },
                });
            }
            setSpriteCode(prevCodeMap => ({
                ...prevCodeMap,
                [selectedSpriteId]: `// エラー: ブロックデータの処理に失敗しました。\n// 詳細: ${error.message}\n// Scratch 3.0のブロックをJavaScriptにコンパイルするには、適切なコンパイラが必要です。\n`
            }));
        }
    }, [selectedSpriteId, props.vm]);

    // selectedSpriteId または spriteCode が変更されたときにエディタの内容を更新 (変更なし)
    useEffect(() => {
        if (!editorInstance.current || !selectedSpriteId) {
            return;
        }

        const newCode = spriteCode[selectedSpriteId] || '';
        if (editorInstance.current.state.doc.toString() !== newCode) {
            editorInstance.current.dispatch({
                changes: {
                    from: 0,
                    to: editorInstance.current.state.doc.length,
                    insert: newCode
                },
            });
            console.log(`エディタの内容をスプライトID ${selectedSpriteId} のコードで更新しました。`);
        }
    }, [selectedSpriteId, spriteCode]);

    // props.sprites または props.stage の変更を監視し、spriteCode を更新 (変更なし)
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
            console.log("スプライトリストが変更されました。コードマップを更新しました。");
        }
    }, [props.sprites, props.stage, spriteCode]);

    // ツールバーのアクションハンドラ (変更なし)
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
                // toshの出力はVMの内部APIに依存するため、この方法は一般的に不十分です。
                // new Function(currentCode)(); // セキュリティリスクに注意
            } catch (e) {
                console.error("JavaScriptコードの実行中にエラーが発生しました:", e);
            }
        }
    }, []);


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
