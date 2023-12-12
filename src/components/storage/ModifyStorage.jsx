/*
 * Copyright (C) 2023 Red Hat, Inc.
 *
 * This program is free software; you can redistribute it and/or modify it
 * under the terms of the GNU Lesser General Public License as published by
 * the Free Software Foundation; either version 2.1 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public License
 * along with This program; If not, see <http://www.gnu.org/licenses/>.
 */
import cockpit from "cockpit";
import React, { useState } from "react";

import {
    Button,
    Modal,
    Text,
    TextContent,
    TextVariants,
} from "@patternfly/react-core";
import { WrenchIcon, ExternalLinkAltIcon } from "@patternfly/react-icons";

const _ = cockpit.gettext;
const N_ = cockpit.noop;

let cockpit_window = null;

const startCockpitStorage = (diskSelection, onStart, onStarted, errorHandler) => {
    window.localStorage.setItem("cockpit_anaconda",
                                JSON.stringify({
                                    mount_point_prefix: "/mnt/sysimage",
                                    available_devices: diskSelection.usableDisks.map(d => "/dev/" + d),
                                }));
    cockpit_window = window.open("/cockpit/@localhost/storage/index.html", "storage-tab");
    onStart();
    onStarted();
};

const stopCockpitStorage = () => {
    if (cockpit_window) {
        cockpit_window.close();
        cockpit_window = null;
    }
};

const StorageModifiedModal = ({ onClose, onRescan }) => {
    return (
        <Modal
          id="storage-modified-modal"
          title={_("Modified storage")}
          isOpen
          variant="small"
          showClose={false}
          footer={
              <>
                  <Button
                    onClick={() => { stopCockpitStorage(); onClose(); onRescan() }}
                    variant="primary"
                    id="storage-modified-modal-rescan-btn"
                    key="rescan"
                  >
                      {_("Rescan storage")}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => { stopCockpitStorage(); onClose() }}
                    id="storage-modified-modal-ignore-btn"
                    key="ignore"
                  >
                      {_("Ignore")}
                  </Button>
              </>
          }>
            {_("If you have made changes on partitions or disks, please rescan storage.")}
        </Modal>
    );
};

const ModifyStorageModal = ({ diskSelection, onClose, onToolStarted, errorHandler }) => {
    const [toolIsStarting, setToolIsStarting] = useState(false);
    const onStart = () => setToolIsStarting(true);
    const onStarted = () => { setToolIsStarting(false); onToolStarted() };
    return (
        <Modal
          id="modify-storage-modal"
          title={_("Modify storage")}
          isOpen
          variant="small"
          titleIconVariant="warning"
          showClose={false}
          footer={
              <>
                  <Button
                    onClick={() => startCockpitStorage(
                        diskSelection,
                        onStart,
                        onStarted,
                        errorHandler
                    )}
                    id="modify-storage-modal-modify-btn"
                    icon={toolIsStarting ? null : <ExternalLinkAltIcon />}
                    isLoading={toolIsStarting}
                    isDisabled={toolIsStarting}
                    variant="primary"
                  >
                      {_("Launch storage editor")}
                  </Button>
                  <Button
                    variant="link"
                    onClick={() => onClose()}
                    id="modify-storage-modal-cancel-btn"
                    key="cancel"
                    isDisabled={toolIsStarting}
                  >
                      {_("Cancel")}
                  </Button>
              </>
          }>
            <TextContent>
                <Text component={TextVariants.p}>
                    {_("The storage editor lets you resize, delete, and create partitions. It can set up LVM and much more.")}
                </Text>
                <Text component={TextVariants.p}>
                    {_("Changes made in the storage editor will directly affect your storage.")}
                </Text>
            </TextContent>
        </Modal>
    );
};

export const ModifyStorage = ({ idPrefix, diskSelection, onCritFail, onRescan }) => {
    const [openedDialog, setOpenedDialog] = useState("");

    return (
        <>
            <Button
              id={idPrefix + "-modify-storage"}
              variant="link"
              icon={<WrenchIcon />}
              onClick={() => setOpenedDialog("modify")}>
                {_("Modify storage")}
            </Button>
            {openedDialog === "modify" &&
             <ModifyStorageModal
              diskSelection={diskSelection}
              onClose={() => setOpenedDialog("")}
              onToolStarted={() => setOpenedDialog("rescan")}
              errorHandler={onCritFail({ context: N_("Modifying the storage failed.") })}
            />}
            {openedDialog === "rescan" &&
            <StorageModifiedModal
              onClose={() => setOpenedDialog("")}
              onRescan={onRescan}
            />}
        </>
    );
};
