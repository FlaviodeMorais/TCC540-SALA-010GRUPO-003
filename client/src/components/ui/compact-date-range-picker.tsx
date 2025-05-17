import * as React from "react"
import { addDays, format } from "date-fns"
import { DateRange } from "react-day-picker"
import { Calendar as CalendarIcon } from "lucide-react"
import { ptBR } from 'date-fns/locale'

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { CompactCalendar } from "@/components/ui/compact-calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function CompactDateRangePicker({
  dateRange,
  setDateRange,
  className,
  calendarClassName,
  numMonths = 1,
  shortFormat = false,
}: {
  dateRange?: DateRange
  setDateRange: (dateRange?: DateRange) => void
  className?: string
  calendarClassName?: string
  numMonths?: number
  shortFormat?: boolean
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left h-8 text-xs font-normal px-2",
              !dateRange && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-1 h-3 w-3" />
            {dateRange?.from ? (
              dateRange.to ? (
                <div className="flex gap-1">
                  <span>
                    {format(dateRange.from, shortFormat ? "dd/MM" : "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                  <span>-</span>
                  <span>
                    {format(dateRange.to, shortFormat ? "dd/MM" : "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              ) : (
                format(dateRange.from, shortFormat ? "dd/MM" : "dd/MM/yyyy", { locale: ptBR })
              )
            ) : (
              <span>Período</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CompactCalendar
            initialFocus
            mode="range"
            className={calendarClassName}
            defaultMonth={dateRange?.from}
            selected={dateRange}
            onSelect={setDateRange}
            numberOfMonths={numMonths}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}