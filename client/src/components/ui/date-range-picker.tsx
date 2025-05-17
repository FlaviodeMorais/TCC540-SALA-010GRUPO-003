import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  setDateRange: (dateRange: DateRange | undefined) => void;
  label?: string;
  className?: string;
}

export function DateRangePicker({ dateRange, setDateRange, label, className }: DateRangePickerProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <label className="text-xs sm:text-sm font-medium mb-1 block text-gray-300">{label}</label>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-full justify-start text-left font-normal bg-[#1e293b] border border-white/5 hover:bg-white/10 text-xs sm:text-sm px-3 py-2 h-9 sm:h-10",
              !dateRange && "text-gray-400"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {dateRange?.from ? (
              dateRange.to ? (
                <>
                  {format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })} -{" "}
                  {format(dateRange.to, "dd/MM/yyyy", { locale: ptBR })}
                </>
              ) : (
                format(dateRange.from, "dd/MM/yyyy", { locale: ptBR })
              )
            ) : (
              <span>Selecionar período...</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-[#1e293b] border border-white/5" align="start">
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={setDateRange}
            initialFocus
            locale={ptBR}
            className="bg-[#1e293b]"
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}