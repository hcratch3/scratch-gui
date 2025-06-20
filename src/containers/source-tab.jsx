import React, { useState, useEffect, useRef, useCallback } from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';

// CodeMirror 6のモジュールを直接インポート
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { oneDark } from "@codemirror/theme-one-dark";
import { history, undo, redo } from '@codemirror/commands'; // 履歴機能
import { bracketMatching } from '@codemirror/language'; // ブラケットマッチング
import { autocompletion, CompletionContext } from '@codemirror/autocomplete'; // 入力補助用に追加

import styles from '../components/source/source.css'; // 既存のスタイルシート
import VM from 'scratch-vm';
import { activateTab, SOURCE_TAB_INDEX } from '../reducers/editor-tab';
import { setRestore } from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

const SourceTab = (props) => {
    const editorRef = useRef(null); // エディタをマウントするDOM要素への参照
    const editorInstance = useRef(null); // CodeMirrorエディタインスタンスへの参照

    const [spriteCode, setSpriteCode] = useState(() => {
        // 初期化時にスプライトのコードマップを作成
        const codeMap = {};
        Object.keys(props.sprites).forEach((spriteId) => {
            codeMap[spriteId] = '';
        });
        if (props.stage) {
            codeMap[props.stage.id] = '';
        }
        return codeMap;
    });

    // 現在選択されているスプライトのIDを状態として保持
    const [selectedSpriteId, setSelectedSpriteId] = useState(props.editingTarget);

    // Scratchブロックに対応するカスタム補完項目を定義
    // この関数がCodeMirrorに補完候補を提供します
    const scratchCompletions = useCallback((context) => {
        const word = context.matchBefore(/\w*/); // カーソル位置の単語をマッチ
        if (!word.from || word.from === word.to && !context.explicit) {
            // 単語の途中ではない、または明示的なトリガーではない場合は補完しない
            return null;
        }

        // Scratchの一般的なブロックや関連するキーワードをここにリストアップ
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
            // 必要に応じてさらにScratchブロックに対応するキーワードや関数を追加
        ];

        // 単語のプレフィックスにマッチする項目をフィルタリング
        const filteredCompletions = completions.filter(item =>
            item.label.toLowerCase().startsWith(word.text.toLowerCase()) // 大文字小文字を区別しない検索
        );

        return {
            from: word.from,
            options: filteredCompletions
        };
    }, []); // 依存配列が空なので、この関数は一度だけ作成される


    // エディタの初期化とクリーンアップ
    useEffect(() => {
        const initializeEditor = () => {
            if (!editorRef.current) {
                return;
            }

            const initialDoc = spriteCode[selectedSpriteId] || '';

            // エディタの拡張機能の定義
            const extensions = [
                lineNumbers(),          // 行番号
                history(),              // 履歴
                bracketMatching(),      // ブラケットマッチング
                highlightActiveLine(),  // アクティブな行のハイライト
                // JavaScript言語サポートをベースとして使用
                // ここで、必要に応じてカスタム言語拡張をプラグインすることができます
                javascript(),
                // カスタム入力補助を自動補完に追加
                autocompletion({ override: [scratchCompletions] }),
                keymap.of([
                    indentWithTab,      // Tabキーでのインデント
                    { key: "Mod-z", run: undo },       // Undo
                    { key: "Mod-Shift-z", run: redo }  // Redo
                ]),
                oneDark, // ダークテーマ
                EditorView.lineWrapping, // 行の折り返し
                EditorView.updateListener.of((update) => {
                    // エディタの内容が変更されたときのコールバック
                    if (update.docChanged) {
                        handleCodeChange(update.state.doc.toString());
                    }
                })
            ];

            // エディタの状態を作成
            const startState = EditorState.create({
                doc: initialDoc,
                extensions: extensions
            });

            // エディタのビューを作成し、DOM要素にマウント
            const view = new EditorView({
                state: startState,
                parent: editorRef.current
            });

            // editorInstance refにエディタインスタンスを保存
            editorInstance.current = view;

            console.log("CodeMirror 6 エディターが初期化されました。");
        };

        // editorInstance.current が null の場合のみ初期化を実行
        if (!editorInstance.current) {
            initializeEditor();
        }

        // クリーンアップ関数: コンポーネントがアンマウントされるときにエディタを破棄
        return () => {
            if (editorInstance.current) {
                console.log("CodeMirror 6 エディターを破棄します。");
                editorInstance.current.destroy();
                editorInstance.current = null;
            }
        };
    }, [selectedSpriteId, spriteCode, scratchCompletions]); // scratchCompletions も依存に含める

    const handleCodeChange = useCallback((newCode) => {
        setSpriteCode(prevCodeMap => ({
            ...prevCodeMap,
            [selectedSpriteId]: newCode
        }));
    }, [selectedSpriteId]);

    // props.editingTarget が変更されたときの処理
    useEffect(() => {
        if (props.editingTarget !== selectedSpriteId) {
            setSelectedSpriteId(props.editingTarget);
        }
    }, [props.editingTarget, selectedSpriteId]);

    // selectedSpriteId または spriteCode が変更され、かつエディタがロード済みの場合
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
            });
            console.log(`エディタの内容をスプライトID ${selectedSpriteId} のコードで更新しました。`);
        }
    }, [selectedSpriteId, spriteCode]);

    // props.sprites または props.stage の変更を監視し、spriteCode を更新
    useEffect(() => {
        const newCodeMap = {};
        let changed = false;

        // 既存のスプライトのコードを保持または初期化
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

        // 存在しないスプライトのコードを削除
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
