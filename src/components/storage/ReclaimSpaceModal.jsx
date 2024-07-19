/*
 * Copyright (C) 2024 Red Hat, Inc.
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

import { fmt_to_fragments as fmtToFragments } from "utils";

import React, { useContext, useEffect, useState } from "react";
import {
    ActionList,
    Button,
    Flex,
    FlexItem,
    HelperText,
    HelperTextItem,
    Modal,
    ModalVariant,
    Panel,
    Popover,
    Slider,
    Stack,
    Text,
    TextContent,
} from "@patternfly/react-core";
import { CompressArrowsAltIcon, HddIcon, TrashIcon, UndoIcon } from "@patternfly/react-icons";

import { isDeviceShrinkable, removeDevice, shrinkDevice } from "../../apis/storage_partitioning_automatic_resizable.js";

import { getDeviceAncestors, unitMultiplier } from "../../helpers/storage.js";

import { ModalError } from "cockpit-components-inline-notification.jsx";
import { ListingTable } from "cockpit-components-table.jsx";

import { StorageContext } from "../Common.jsx";
import { useDiskFreeSpace, useOriginalDevices, useRequiredSize } from "./Common.jsx";

import "./ReclaimSpaceModal.scss";

const _ = cockpit.gettext;
const idPrefix = "reclaim-space-modal";

export const ReclaimSpaceModal = ({ isFormDisabled, onClose, onNext }) => {
    const { diskSelection, partitioning } = useContext(StorageContext);
    const devices = useOriginalDevices();
    const [dialogError, setDialogError] = useState();
    const [onNextClicked, setOnNextClicked] = useState(false);
    const [unappliedActions, setUnappliedActions] = useState(
        Object.keys(devices).reduce((acc, device) => { acc[device] = []; return acc }, {})
    );
    const rows = (
        diskSelection.selectedDisks
                .map(disk => getDeviceRow(disk, devices, 0, unappliedActions, setUnappliedActions))
                .flat(Infinity)
    );

    const onReclaim = async () => {
        for (const item of Object.entries(unappliedActions)) {
            const [device, actions] = item;
            for (const action of actions) {
                try {
                    if (action.type === "remove") {
                        await removeDevice({
                            deviceName: device,
                            deviceTree: partitioning.deviceTree.path,
                        });
                    } else if (action.type === "shrink") {
                        await shrinkDevice({
                            deviceName: device,
                            deviceTree: partitioning.deviceTree.path,
                            newSize: action.value,
                        });
                    }
                } catch (error) {
                    if (action.type === "remove") {
                        setDialogError({ ...error, text: cockpit.format(_("Unable to schedule deletion of $0"), device) });
                    } else if (action.type === "shrink") {
                        setDialogError({ ...error, text: cockpit.format(_("Unable to schedule resizing of $0"), device) });
                    }

                    return;
                }
            }
        }
        setOnNextClicked(true);
    };

    useEffect(() => {
        // Call the onNextClicked only once the form is not disabled
        // otherwise it silently fails
        if (onNextClicked && !isFormDisabled) {
            onNext();
            setOnNextClicked(false);
        }
    }, [onNextClicked, isFormDisabled, onNext]);

    return (
        <Modal
          description={
              <TextContent>
                  <Text>{_("Remove or resize existing filesystems to free up space for the installation.")}</Text>
                  <Text>{
                      _(
                          "Removing a filesystem will permanently delete all of the data it contains. " +
                          "Resizing a partition can free up unused space, but is not risk-free. " +
                          "Be sure to have backups of anything important before reclaiming space."
                      )
                  }
                  </Text>
              </TextContent>
          }
          id={idPrefix}
          isOpen
          onClose={onClose}
          size="md"
          title={_("Reclaim space")}
          variant={ModalVariant.large}
          footer={
              <ReclaimFooter isFormDisabled={isFormDisabled} unappliedActions={unappliedActions} onReclaim={onReclaim} onClose={onClose} />
          }
        >
            <Stack hasGutter>
                {dialogError && <ModalError variant="warning" dialogError={dialogError.text} dialogErrorDetail={dialogError.message} />}
                <Panel variant="bordered">
                    <ListingTable
                      aria-label={_("Reclaim space")}
                      columns={[
                          { props: { width: 20 }, title: _("Name") },
                          { props: { width: 20 }, title: _("Location") },
                          { props: { width: 20 }, title: _("Type") },
                          { props: { width: 20 }, title: _("Space") },
                          { props: { width: 20 }, title: _("Actions") }
                      ]}
                      emptyCaption={_("No devices")}
                      id={idPrefix + "-table"}
                      rows={rows}
                    />
                </Panel>
            </Stack>
        </Modal>
    );
};

const getReclaimableSpaceFromAction = ({ action, devices, unappliedActions }) => {
    const isDeviceRemoved = device => (
        unappliedActions[device].map(_action => _action.type).includes("remove")
    );
    const isDeviceResized = device => (
        unappliedActions[device].map(_action => _action.type).includes("shrink")
    );
    const isDeviceParentRemoved = device => (
        getDeviceAncestors(devices, device).some(isDeviceRemoved)
    );

    if (action === "remove") {
        return Object.keys(unappliedActions)
                .filter(device => isDeviceRemoved(device) && !isDeviceParentRemoved(device))
                .reduce((acc, device) => acc + devices[device].total.v - devices[device].free.v, 0);
    }

    if (action === "shrink") {
        return Object.keys(unappliedActions)
                .filter(device => isDeviceResized(device) && !isDeviceParentRemoved(device))
                .reduce((acc, device) => acc + unappliedActions[device].reduce((acc, action) => acc + devices[device].total.v - action.value, 0), 0);
    }
};

const ReclaimFooter = ({ isFormDisabled, onClose, onReclaim, unappliedActions }) => {
    const { diskSelection } = useContext(StorageContext);
    const devices = useOriginalDevices();
    const diskFreeSpace = useDiskFreeSpace({ devices, selectedDisks: diskSelection.selectedDisks });
    const requiredSize = useRequiredSize();
    const selectedSpaceToDelete = getReclaimableSpaceFromAction({ action: "remove", devices, unappliedActions });
    const selectedSpaceToShrink = getReclaimableSpaceFromAction({ action: "shrink", devices, unappliedActions });
    const selectedSpaceToReclaim = selectedSpaceToDelete + selectedSpaceToShrink;
    const status = (diskFreeSpace + selectedSpaceToReclaim) < requiredSize ? "warning" : "success";

    return (
        <Stack hasGutter>
            <HelperText>
                <HelperTextItem isDynamic variant={status}>
                    {fmtToFragments(
                        _("Available free space: $0. Installation requires: $1."),
                        <b id={idPrefix + "-hint-available-free-space"}>{cockpit.format_bytes(diskFreeSpace + selectedSpaceToReclaim)}</b>,
                        <b>{cockpit.format_bytes(requiredSize)}</b>
                    )}
                </HelperTextItem>
            </HelperText>
            <ActionList>
                <Button isDisabled={status === "warning" || isFormDisabled} key="reclaim" variant="warning" onClick={onReclaim}>
                    {_("Reclaim space")}
                </Button>
                <Button key="cancel" variant="link" onClick={onClose}>
                    {_("Cancel")}
                </Button>
            </ActionList>
        </Stack>
    );
};

const getDeviceRow = (disk, devices, level = 0, unappliedActions, setUnappliedActions) => {
    const device = devices[disk];
    const description = device.description.v ? cockpit.format("$0 ($1)", disk, device.description.v) : disk;
    const isDisk = device["is-disk"].v;
    const descriptionWithIcon = (
        isDisk
            ? (
                <Flex spaceItems={{ default: "spaceItemsSm" }} alignItems={{ default: "alignItemsCenter" }}>
                    <FlexItem><HddIcon /></FlexItem>
                    <FlexItem>{description}</FlexItem>
                </Flex>
            )
            : description
    );
    const location = device["is-disk"].v ? device.path.v : "";
    const classNames = [
        idPrefix + "-table-row",
        idPrefix + "-device-level-" + level,
    ];

    if (!device.children.v.length) {
        const parentDevice = device.parents.v[0] ? devices[device.parents.v[0]] : undefined;
        const siblings = parentDevice?.children.v;
        const isLastChild = !siblings || siblings.findIndex((child) => child === disk) === siblings.length - 1;

        if (isLastChild) {
            classNames.push(idPrefix + "-device-leaf");
        }
    }
    const size = level < 2 ? cockpit.format_bytes(device.total.v) : "";
    const deviceActions = (
        <DeviceActions
          device={device}
          level={level}
          unappliedActions={unappliedActions}
          setUnappliedActions={setUnappliedActions}
        />
    );

    return [
        {
            columns: [
                { title: descriptionWithIcon },
                { title: location },
                { title: device.type.v },
                { title: size },
                { title: deviceActions }
            ],
            props: { className: classNames.join(" "), key: disk },
        },
        ...device.children.v.map((child) => getDeviceRow(child, devices, level + 1, unappliedActions, setUnappliedActions))
    ];
};

const getDeviceActionOfType = ({ device, type, unappliedActions }) => {
    return unappliedActions[device].find(action => action.type === type);
};

const DeviceActions = ({ device, level, setUnappliedActions, unappliedActions }) => {
    // Only show actions for disks and the first level of partitions
    // This is to simplify the feature for the first iteration
    if (level > 1) {
        return null;
    }

    const parents = device.parents.v;
    const parentHasRemove = parents?.some((parent) => getDeviceActionOfType({ device: parent, type: "remove", unappliedActions }));
    const hasBeenRemoved = parentHasRemove || getDeviceActionOfType({ device: device.name.v, type: "remove", unappliedActions });
    const newDeviceSize = getDeviceActionOfType({ device: device.name.v, type: "shrink", unappliedActions })?.value;
    const hasUnappliedActions = !parentHasRemove && unappliedActions[device.name.v].length > 0;

    const onAction = (action, value = "") => {
        setUnappliedActions((prevUnappliedActions) => {
            const _unappliedActions = { ...prevUnappliedActions };
            _unappliedActions[device.name.v].push({ type: action, value });

            return _unappliedActions;
        });
    };
    const onUndo = () => {
        setUnappliedActions((prevUnappliedActions) => {
            const _unappliedActions = { ...prevUnappliedActions };
            _unappliedActions[device.name.v].pop();

            return _unappliedActions;
        });
    };
    const deviceActionProps = {
        device,
        hasBeenRemoved,
        newDeviceSize,
        onAction,
    };

    return (
        <Flex spaceItems={{ default: "spaceItemsXs" }}>
            <DeviceActionShrink {...deviceActionProps} />
            <DeviceActionDelete {...deviceActionProps} />
            {hasUnappliedActions && <Button variant="plain" icon={<UndoIcon />} onClick={onUndo} aria-label={_("undo")} />}
        </Flex>
    );
};

const DeleteText = () => (
    <span className={idPrefix + "-device-action-delete"}>{_("delete")}</span>
);

const DeviceActionDelete = ({ device, hasBeenRemoved, newDeviceSize, onAction }) => {
    const onRemove = () => onAction("remove");

    // Disable the remove action for disk devices without partitions
    const isRemoveDisabled = device.type.v === "disk" && device.children.v.length === 0;

    // Do not show 'delete' text for disks directly, we show 'delete' text for the contained partitions
    const deleteText = device.type.v !== "disk" ? <DeleteText /> : "";
    const deleteButton = (
        <Button
          aria-label={_("delete")}
          icon={<TrashIcon />}
          isDisabled={isRemoveDisabled}
          onClick={onRemove}
          variant="plain"
        />
    );

    if (newDeviceSize !== undefined) {
        return null;
    }

    return (
        hasBeenRemoved
            ? deleteText
            : deleteButton
    );
};

const ShrinkText = ({ newDeviceSize }) => (
    <span className={idPrefix + "-device-action-shrink"}>
        {cockpit.format(_("shrink to $0"), cockpit.format_bytes(newDeviceSize))}
    </span>
);

const useIsDeviceShrinkable = ({ device }) => {
    const { partitioning } = useContext(StorageContext);
    const [isShrinkable, setIsShrinkable] = useState(undefined);

    useEffect(() => {
        const getIsShrinkable = async () => {
            const isShrinkable = await isDeviceShrinkable({
                deviceName: device.name.v,
                deviceTree: partitioning.deviceTree.path,
            });

            setIsShrinkable(isShrinkable);
        };
        getIsShrinkable();
    }, [device.name.v, partitioning.deviceTree.path]);

    return isShrinkable;
};

const DeviceActionShrink = ({ device, hasBeenRemoved, newDeviceSize, onAction }) => {
    const onShrink = value => onAction("shrink", value);
    const isDeviceShrinkable = useIsDeviceShrinkable({ device });
    const shrinkButton = <ShrinkPopover device={device} isDisabled={!isDeviceShrinkable} onShrink={onShrink} />;

    if (hasBeenRemoved) {
        return null;
    }

    return (
        newDeviceSize
            ? <ShrinkText newDeviceSize={newDeviceSize} />
            : (device.type.v !== "disk" && shrinkButton)
    );
};

const ShrinkPopover = ({ device, isDisabled, onShrink }) => {
    const [value, setValue] = useState(device.total.v);
    const originalUnit = cockpit.format_bytes(device.total.v).split(" ")[1];
    const shrinkButton = <Button variant="plain" isDisabled={isDisabled} icon={<CompressArrowsAltIcon />} aria-label={_("shrink")} />;

    return (
        <Popover
          aria-label={_("shrink")}
          id={idPrefix + "-shrink"}
          hasAutoWidth
          bodyContent={() => (
              <Flex alignItems={{ default: "alignItemsFlexStart" }} spaceItems={{ default: "spaceItemsMd" }}>
                  <Slider
                    areCustomStepsContinuous
                    className={idPrefix + "-shrink-slider"}
                    id={idPrefix + "-shrink-slider"}
                    inputLabel={originalUnit}
                    inputValue={cockpit.format_bytes(value, originalUnit).split(" ")[0]}
                    isInputVisible
                    value={value * 100 / device.total.v}
                    showBoundaries={false}
                    onChange={(_, sliderValue, inputValue) => {
                        if (inputValue !== undefined) {
                            // Ensure that the boundary is respected
                            const newInputValue = Math.min(device.total.v, inputValue * unitMultiplier[originalUnit]);
                            setValue(newInputValue);
                        } else if (sliderValue !== undefined) {
                            setValue(Math.round((sliderValue / 100) * device.total.v));
                        }
                    }}
                    customSteps={[
                        { label: "0", value: 0 },
                        { label: cockpit.format_bytes(device.total.v), value: 100 },
                    ]}
                  />
                  <Button
                    id={idPrefix + "-shrink-button"}
                    variant="primary"
                    isDisabled={value === 0 || value === device.total.v}
                    onClick={() => onShrink(value)}>
                      {_("Resize")}
                  </Button>
              </Flex>
          )}
        >
            {shrinkButton}
        </Popover>
    );
};
