"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/components/ui/utils";
import { buttonVariants } from "@/components/ui/Button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "p-0",
        months: "flex flex-col sm:flex-row gap-4",
        month: "space-y-4",
        month_caption:
          "relative z-0 flex min-h-10 items-center justify-center pt-1 pb-1",
        caption_label: "text-sm font-medium",
        nav: "absolute left-0 top-1 z-10 flex w-full items-center justify-between px-1",
        button_previous:
          "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        button_next:
          "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        chevron: "pointer-events-none",
        month_grid: "w-full border-collapse space-y-1",
        weekdays: "grid grid-cols-7",
        weekday:
          "w-9 rounded-md text-center text-[0.75rem] font-medium text-muted-foreground",
        weeks: "grid",
        week: "grid grid-cols-7 mt-2",
        day: "relative h-9 w-9 p-0 text-center text-sm",
        day_button: cn(
          buttonVariants({ variant: "ghost", size: "icon" }),
          "h-9 w-9 rounded-md p-0 font-normal aria-selected:opacity-100",
        ),
        selected:
          "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        range_start:
          "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        range_middle: "rounded-md bg-muted text-foreground",
        range_end:
          "rounded-md bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
        today: "rounded-md bg-muted text-foreground",
        outside:
          "text-muted-foreground opacity-50 aria-selected:bg-muted aria-selected:text-muted-foreground aria-selected:opacity-30",
        disabled: "text-muted-foreground opacity-50",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...iconProps }) => {
          const Icon =
            orientation === "left" ? ChevronLeftIcon : ChevronRightIcon;
          return (
            <Icon className={cn("h-4 w-4", iconClassName)} {...iconProps} />
          );
        },
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
