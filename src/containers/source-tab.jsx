import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import {
    activateTab,
    SOURCE_TAB_INDEX
} from '../reducers/editor-tab';

import {setRestore} from '../reducers/restore-deletion';
import errorBoundaryHOC from '../lib/error-boundary-hoc.jsx';

class EditorTab extends React.Component {
    constructor(props) {
        super(props);
        bindAll(this, [
            'handleCodeChange',
            'handleSpriteChange'
        ]);

        // スプライトごとのコードを保持
        this.state = {
            spriteCode: this.initializeSpriteCode(props.sprites, props.stage),
            selectedSpriteId: props.editingTarget // 現在選択されているスプライトID
        };
    }

    componentWillReceiveProps(nextProps) {
        // スプライトが追加された場合に初期化
        if (Object.keys(nextProps.sprites).length !== Object.keys(this.props.sprites).length) {
            this.setState({
                spriteCode: this.initializeSpriteCode(nextProps.sprites, nextProps.stage)
            });
        }

        // 編集対象スプライトが変わった場合に選択を更新
        if (nextProps.editingTarget !== this.props.editingTarget) {
            this.setState({selectedSpriteId: nextProps.editingTarget});
        }
    }

    initializeSpriteCode(sprites, stage) {
        const codeMap = {};
        // スプライトとステージの初期コードを空文字列で設定
        Object.keys(sprites).forEach(spriteId => {
            codeMap[spriteId] = '';
        });
        if (stage) {
            codeMap[stage.id] = '';
        }
        return codeMap;
    }

    handleCodeChange(event) {
        const newCode = event.target.value;
        const {selectedSpriteId, spriteCode} = this.state;

        // 選択中のスプライトのコードを更新
        this.setState({
            spriteCode: {
                ...spriteCode,
                [selectedSpriteId]: newCode
            }
        });
    }

    handleSpriteChange(spriteId) {
        // スプライトの切り替え
        this.setState({selectedSpriteId: spriteId});
    }

    render () {
        const {
            dispatchUpdateRestore, // eslint-disable-line no-unused-vars
            intl,
            isRtl,
            vm
        } = this.props;

        if (!vm.editingTarget) {
            return null;
        }

        const isStage = vm.editingTarget.isStage;
        const target = vm.editingTarget.sprite;

        return (
            <AssetPanel
                dragType={DragConstants.COSTUME}
                isRtl={isRtl}
            >
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.css">
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/codemirror.min.js"></script>
                <script src="https://cdnjs.cloudflare.com/ajax/libs/codemirror/6.65.7/mode/javascript/javascript.min.js"></script>
                <div>
                    <textarea id="txt-editor"></textarea>

                    <script type="text/javascript">
                        editor = CodeMirror.fromTextArea(document.getElementById("txt-editor"),
                        {
                            mode:"javascript",
                            lineNumbers: true,　 // 行番号を表示する
                            lineWrapping: true,　 // 行を折り返す
                        });
                    </script>
                </div> 
            </AssetPanel>
        );
    }
}

EditorTab.propTypes = {
    editingTarget: PropTypes.string,
    sprites: PropTypes.object.isRequired,
    stage: PropTypes.object,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    vm: state.scratchGui.vm
});

export default errorBoundaryHOC('Source Tab')(
    connect(mapStateToProps)(SourceTab)
);
