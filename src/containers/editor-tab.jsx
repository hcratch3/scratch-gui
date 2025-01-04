import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

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

    render() {
        const {spriteCode, selectedSpriteId} = this.state;
        const {sprites, stage} = this.props;

        const currentCode = spriteCode[selectedSpriteId] || '';

        return (
            <div className="editor-tab">
                <div className="sprite-selector">
                    <h3>Sprites</h3>
                    <ul>
                        {/* スプライトのリストを表示 */}
                        {Object.keys(sprites).map(spriteId => (
                            <li
                                key={spriteId}
                                className={spriteId === selectedSpriteId ? 'selected' : ''}
                                onClick={() => this.handleSpriteChange(spriteId)}
                            >
                                {sprites[spriteId].name}
                            </li>
                        ))}
                        {/* ステージも選択可能 */}
                        {stage && (
                            <li
                                key={stage.id}
                                className={stage.id === selectedSpriteId ? 'selected' : ''}
                                onClick={() => this.handleSpriteChange(stage.id)}
                            >
                                Stage
                            </li>
                        )}
                    </ul>
                </div>
                <div className="code-editor">
                    <h3>Code Editor</h3>
                    <textarea
                        value={currentCode}
                        onChange={this.handleCodeChange}
                        placeholder="Write your code here..."
                    />
                </div>
            </div>
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

export default errorBoundaryHOC('EditorTab')(
    connect(mapStateToProps)(EditorTab)
);
