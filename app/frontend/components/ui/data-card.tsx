// bm-design-system: data-card primitive (mobile card variant of a table row)
import * as React from "react"
import { cn } from "@/lib/utils"

type DataCardProps = React.HTMLAttributes<HTMLElement> & {
  onClick?: () => void
  as?: "article" | "button" | "div"
}

const DataCard = React.forwardRef<HTMLElement, DataCardProps>(
  ({ className, onClick, as, children, ...props }, ref) => {
    const Tag = (as ?? (onClick ? "button" : "article")) as React.ElementType
    return (
      <Tag
        ref={ref as never}
        onClick={onClick}
        className={cn(
          "block w-full rounded-md border border-hairline bg-page p-4 text-left",
          onClick && "cursor-pointer hover:border-ink-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          className,
        )}
        {...props}
      >
        {children}
      </Tag>
    )
  },
)
DataCard.displayName = "DataCard"

const DataCardHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex items-start justify-between gap-3", className)}
    {...props}
  />
)
DataCardHeader.displayName = "DataCardHeader"

const DataCardTitle = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "min-w-0 flex-1 break-words text-sm font-medium text-ink-display",
      className,
    )}
    {...props}
  />
)
DataCardTitle.displayName = "DataCardTitle"

const DataCardStatus = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("shrink-0", className)} {...props} />
)
DataCardStatus.displayName = "DataCardStatus"

const DataCardGrid = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDListElement>) => (
  <dl
    className={cn("mt-3 grid grid-cols-2 gap-x-3 gap-y-2", className)}
    {...props}
  />
)
DataCardGrid.displayName = "DataCardGrid"

type DataCardFieldProps = {
  label: React.ReactNode
  value: React.ReactNode
  className?: string
  wide?: boolean
}

const DataCardField = ({ label, value, className, wide }: DataCardFieldProps) => (
  <div className={cn(wide && "col-span-2", className)}>
    <dt className="text-xs text-ink-muted">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-ink-body">{value}</dd>
  </div>
)
DataCardField.displayName = "DataCardField"

const DataCardActions = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mt-3 flex flex-col gap-2 border-t border-hairline pt-3 [&>*]:w-full",
      className,
    )}
    {...props}
  />
)
DataCardActions.displayName = "DataCardActions"

type DataCardListProps = React.HTMLAttributes<HTMLDivElement> & {
  empty?: React.ReactNode
  isEmpty?: boolean
}

const DataCardList = ({
  className,
  children,
  empty,
  isEmpty,
  ...props
}: DataCardListProps) => (
  <div className={cn("space-y-3", className)} {...props}>
    {isEmpty ? empty : children}
  </div>
)
DataCardList.displayName = "DataCardList"

export {
  DataCard,
  DataCardHeader,
  DataCardTitle,
  DataCardStatus,
  DataCardGrid,
  DataCardField,
  DataCardActions,
  DataCardList,
}
