import {
  RiArrowLeftRightLine,
  RiArrowLeftSLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiCollapseDiagonal2Line,
  RiErrorWarningLine,
  RiExpandDiagonal2Line,
  RiExternalLinkLine,
  RiFileCopy2Line,
  RiFileTextLine,
  RiFolderOpenLine,
  RiFullscreenLine,
  RiGridLine,
  RiKeyboardLine,
  type RemixiconComponentType,
  RiSave3Line,
  RiSendPlaneLine,
  RiSparklingLine,
} from "@remixicon/react";
import type { ComponentPropsWithoutRef } from "react";

export type IconCode =
  | "close"
  | "external-link"
  | "sparkle"
  | "send"
  | "open-file"
  | "open-many"
  | "switch-node"
  | "load-layout"
  | "save-layout"
  | "zoom-fit"
  | "prev-node"
  | "next-node"
  | "expand-node"
  | "restore-node"
  | "snap-grid"
  | "problems"
  | "shortcuts";

type RemixIconProps = ComponentPropsWithoutRef<typeof RiCloseLine>;

type IconProps = Omit<RemixIconProps, "size"> & {
  code: IconCode;
  size?: number | string;
  width?: number | string;
  height?: number | string;
};

const ICON_COMPONENTS: Record<IconCode, RemixiconComponentType> = {
  close: RiCloseLine,
  "external-link": RiExternalLinkLine,
  sparkle: RiSparklingLine,
  send: RiSendPlaneLine,
  "open-file": RiFileTextLine,
  "open-many": RiFileCopy2Line,
  "switch-node": RiArrowLeftRightLine,
  "load-layout": RiFolderOpenLine,
  "save-layout": RiSave3Line,
  "zoom-fit": RiFullscreenLine,
  "prev-node": RiArrowLeftSLine,
  "next-node": RiArrowRightSLine,
  "expand-node": RiExpandDiagonal2Line,
  "restore-node": RiCollapseDiagonal2Line,
  "snap-grid": RiGridLine,
  problems: RiErrorWarningLine,
  shortcuts: RiKeyboardLine,
};

export function Icon({
  code,
  className,
  size,
  width,
  height,
  ...props
}: IconProps) {
  const iconClassName = className ? `cw-icon ${className}` : "cw-icon";
  const IconComponent = ICON_COMPONENTS[code];
  const resolvedSize = size ?? width ?? height;

  return (
    <IconComponent className={iconClassName} size={resolvedSize} {...props} />
  );
}
