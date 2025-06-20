import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

// CodeMirror 6のモジュールを直接インポート
import { Extension, EditorState } from "@codemirror/state"; // Extensionを追加
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
  defaultKeymap, history, historyKeymap
} from "@codemirror/commands";
import {
  searchKeymap, highlightSelectionMatches
} from "@codemirror/search";
import {
  autocompletion, completionKeymap, closeBrackets,
  closeBracketsKeymap
} from "@codemirror/autocomplete";
import {lintKeymap} from "@codemirror/lint"; // リンター関連

import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";

import styles from '../components/source/source.css'; // 既存のスタイルシート
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

const SourceTab = (props) => {
    const editorRef = useRef(null); // エディタをマウントするDOM要素への参照
    const editorInstance = useRef(null); // CodeMirrorエディタインスタンスへの参照

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

    // Scratchブロックに対応するカスタム補完項目を定義 (再利用)
    const scratchCompletions = useCallback((context) => {
        const word = context.matchBefore(/\w*/);
        if (!word.from || word.from === word.to && !context.explicit) {
            return null;
        }

        const completions = [
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
            { label: "ask", type: "function", info: "質問する (例: ask('What's your name?');)" },
            { label: "answer", type: "variable", info: "質問の答え" },
            { label: "random", type: "function", info: "乱数を生成 (例: random(1, 10);)" },
        ];

        const filteredCompletions = completions.filter(item =>
            item.label.toLowerCase().startsWith(word.text.toLowerCase())
        );

        return {
            from: word.from,
            options: filteredCompletions
        };
    }, []);


    // エディタの初期化とクリーンアップ (コンポーネントマウント時に一度だけ実行)
    useEffect(() => {
        const initializeEditor = () => {
            if (!editorRef.current) {
                return;
            }

            // エディタの初期コンテンツは空文字列にする (後続のuseEffectで実際のコードをセット)
            const initialDoc = ''; 

            // 提示された多機能な拡張機能を統合
            const extensions = [
                // 基本的なCodeMirrorの機能
                lineNumbers(), // 行番号
                foldGutter(), // コード折りたたみ
                highlightSpecialChars(), // 特殊文字のハイライト
                history(), // 履歴
                drawSelection(), // 独自の選択描画
                dropCursor(), // ドロップカーソル
                EditorState.allowMultipleSelections.of(true), // 複数選択を許可
                indentOnInput(), // 入力時のインデント
                syntaxHighlighting(defaultHighlightStyle), // デフォルトのシンタックスハイライト
                bracketMatching(), // ブラケットマッチング
                closeBrackets(), // ブラケットの自動閉じ
                autocompletion({ override: [scratchCompletions] }), // 自動補完とカスタム補完
                rectangularSelection(), // 長方形選択
                crosshairCursor(), // クロスヘアカーソル
                highlightActiveLine(), // アクティブな行のハイライト
                highlightActiveLineGutter(), // アクティブな行のガターハイライト
                highlightSelectionMatches(), // 選択範囲のマッチをハイライト
                javascript(), // JavaScript言語サポート
                oneDark, // ダークテーマ
                EditorView.lineWrapping, // 行の折り返し

                // キーマップの統合
                keymap.of([
                    ...closeBracketsKeymap, // ブラケット閉じ関連キーマップ
                    ...defaultKeymap, // デフォルトのキーマップ
                    ...searchKeymap, // 検索関連キーマップ
                    ...historyKeymap, // 履歴関連キーマップ
                    ...foldKeymap, // コード折りたたみ関連キーマップ
                    ...completionKeymap, // 自動補完関連キーマップ
                    ...lintKeymap // リンター関連キーマップ
                ]),

                // エディタの変更を監視するリスナー
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
    }, [scratchCompletions]); // 依存配列からselectedSpriteIdとspriteCodeを削除し、scratchCompletionsのみを維持
                               // (scratchCompletionsはuseCallbackでメモ化されているため実質は空配列と同様)

    const handleCodeChange = useCallback((newCode) => {
        setSpriteCode(prevCodeMap => ({
            ...prevCodeMap,
            [selectedSpriteId]: newCode
        }));
    }, [selectedSpriteId]);

    // selectedSpriteId の変更を監視 (propsからstateへの同期)
    useEffect(() => {
        if (props.editingTarget !== selectedSpriteId) {
            setSelectedSpriteId(props.editingTarget);
        }
    }, [props.editingTarget, selectedSpriteId]);

    // selectedSpriteId または spriteCode が変更されたときにエディタの内容を更新
    useEffect(() => {
        // editorInstance.current が null の場合（まだ初期化されていない場合）は処理をスキップ
        if (!editorInstance.current || !selectedSpriteId) {
            return;
        }

        const newCode = spriteCode[selectedSpriteId] || '';
        // 現在のエディタのドキュメントと新しいコードが異なる場合のみ更新
        if (editorInstance.current.state.doc.toString() !== newCode) {
            editorInstance.current.dispatch({
                changes: {
                    from: 0,
                    to: editorInstance.current.state.doc.length,
                    insert: newCode
                },
                // エディタを更新する際に、Undo履歴に追加しないようにすることも可能
                // userEvent: "replace"
            });
            console.log(`エディタの内容をスプライトID ${selectedSpriteId} のコードで更新しました。`);
        }
    }, [selectedSpriteId, spriteCode]); // spriteCode も依存に含める

    // props.sprites または props.stage の変更を監視し、spriteCode を更新
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

    if (!props.vm.editingTarget) {
        return null;
    }

    return (
        <div
            className={styles.source}
            ref={props.setRef}
            onMouseDown={props.onContainerClick}
        >
            <div style={{ height: '100%', width: '100%' }}>
                <div ref={editorRef} className="codemirror-container" style={{ height: '100%', width: '100%' }} />
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
