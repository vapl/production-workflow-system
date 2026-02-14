"use client";

import * as React from "react";
import {
  AtSignIcon,
  LockIcon,
  MailIcon,
  PhoneIcon,
  SearchIcon,
  UserIcon,
} from "lucide-react";
import { cn } from "@/components/ui/utils";

const ICONS = {
  search: SearchIcon,
  email: MailIcon,
  at: AtSignIcon,
  phone: PhoneIcon,
  user: UserIcon,
  lock: LockIcon,
} as const;

type InputIconName = keyof typeof ICONS;

export type InputProps = React.ComponentProps<"input"> & {
  icon?: InputIconName;
  startIcon?: React.ReactNode;
  endAdornment?: React.ReactNode;
  wrapperClassName?: string;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type = "text",
      icon,
      startIcon,
      endAdornment,
      wrapperClassName,
      ...props
    },
    ref,
  ) => {
    const IconComponent = icon ? ICONS[icon] : null;
    const resolvedStartIcon = startIcon ??
      (IconComponent ? <IconComponent className="h-4 w-4" /> : null);
    const hasStartIcon = Boolean(resolvedStartIcon);
    const hasEndAdornment = Boolean(endAdornment);

    return (
      <div
        className={cn(
          "ui-control relative flex w-full items-center rounded-lg border border-border bg-input-background",
          "focus-within:ring-2 focus-within:ring-ring/30",
          props.disabled ? "cursor-not-allowed opacity-50" : "",
          wrapperClassName,
        )}
      >
        {hasStartIcon ? (
          <span className="pointer-events-none absolute left-3 inline-flex h-4 w-4 items-center justify-center text-muted-foreground">
            {resolvedStartIcon}
          </span>
        ) : null}
        <input
          type={type}
          ref={ref}
          data-slot="input"
          className={cn(
            "w-full bg-transparent px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground",
            hasStartIcon ? "pl-10" : "",
            hasEndAdornment ? "pr-10" : "",
            className,
          )}
          {...props}
        />
        {hasEndAdornment ? (
          <span className="absolute right-2 inline-flex items-center">
            {endAdornment}
          </span>
        ) : null}
      </div>
    );
  },
);

Input.displayName = "Input";

export { Input };
