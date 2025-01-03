import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {defineMessages, intlShape, injectIntl} from 'react-intl';
import VM from 'scratch-vm';

import AssetPanel from '../components/asset-panel/asset-panel.jsx';

import {connect} from 'react-redux';

import {
    activateTab,
    COSTUMES_TAB_INDEX
} from '../reducers/editor-tab';

import {setRestore} from '../reducers/restore-deletion';
import {showStandardAlert, closeAlertWithId} from '../reducers/alerts';

class EditorTab extends React.Component {
    render () {
        const {
            dispatchUpdateRestore, // eslint-disable-line no-unused-vars
            intl,
            isRtl,
            vm,
            onNewSoundFromLibraryClick,
            onNewSoundFromRecordingClick
        } = this.props;

        if (!vm.editingTarget) {
            return null;
        }

        const messages = defineMessages({
            fileUploadSound: {
                defaultMessage: 'Upload Sound',
                description: 'Button to upload sound from file in the editor tab',
                id: 'gui.soundTab.fileUploadSound'
            },
            surpriseSound: {
                defaultMessage: 'Surprise',
                description: 'Button to get a random sound in the editor tab',
                id: 'gui.soundTab.surpriseSound'
            },
            recordSound: {
                defaultMessage: 'Record',
                description: 'Button to record a sound in the editor tab',
                id: 'gui.soundTab.recordSound'
            },
            addSound: {
                defaultMessage: 'Choose a Sound',
                description: 'Button to add a sound in the editor tab',
                id: 'gui.soundTab.addSoundFromLibrary'
            }
        });

        return (
            <AssetPanel>
            </AssetPanel>
        );
    }
}

SoundTab.propTypes = {
    dispatchUpdateRestore: PropTypes.func,
    editingTarget: PropTypes.string,
    intl: intlShape,
    isRtl: PropTypes.bool,
    onActivateCostumesTab: PropTypes.func.isRequired,
    onCloseImporting: PropTypes.func.isRequired,
    onNewSoundFromLibraryClick: PropTypes.func.isRequired,
    onNewSoundFromRecordingClick: PropTypes.func.isRequired,
    onRequestCloseSoundLibrary: PropTypes.func.isRequired,
    onShowImporting: PropTypes.func.isRequired,
    soundLibraryVisible: PropTypes.bool,
    soundRecorderVisible: PropTypes.bool,
    sprites: PropTypes.shape({
        id: PropTypes.shape({
            sounds: PropTypes.arrayOf(PropTypes.shape({
                name: PropTypes.string.isRequired
            }))
        })
    }),
    stage: PropTypes.shape({
        sounds: PropTypes.arrayOf(PropTypes.shape({
            name: PropTypes.string.isRequired
        }))
    }),
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    editingTarget: state.scratchGui.targets.editingTarget,
    isRtl: state.locales.isRtl,
    sprites: state.scratchGui.targets.sprites,
    stage: state.scratchGui.targets.stage,
    soundLibraryVisible: state.scratchGui.modals.soundLibrary,
    soundRecorderVisible: state.scratchGui.modals.soundRecorder
});

const mapDispatchToProps = dispatch => ({
    onActivateCostumesTab: () => dispatch(activateTab(COSTUMES_TAB_INDEX)),
    onNewSoundFromLibraryClick: e => {
        e.preventDefault();
        dispatch(openSoundLibrary());
    },
    onNewSoundFromRecordingClick: () => {
        dispatch(openSoundRecorder());
    },
    onRequestCloseSoundLibrary: () => {
        dispatch(closeSoundLibrary());
    },
    dispatchUpdateRestore: restoreState => {
        dispatch(setRestore(restoreState));
    },
    onCloseImporting: () => dispatch(closeAlertWithId('importingAsset')),
    onShowImporting: () => dispatch(showStandardAlert('importingAsset'))
});

export default errorBoundaryHOC('Editor Tab')(
    injectIntl(connect(
        mapStateToProps,
        mapDispatchToProps
    )(EditorTab))
);
