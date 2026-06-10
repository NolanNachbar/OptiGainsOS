import * as React from "react";

const TabsContext = React.createContext({ value: "", onValueChange: () => {} });

const Tabs = ({ value: controlledValue, onValueChange, defaultValue, children, className = "", ...props }) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || "");
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : internalValue;

  const handleValueChange = (newValue) => {
    if (!isControlled) {
      setInternalValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
};

const TabsList = React.forwardRef(({ className = "", ...props }, ref) => (
  <div
    ref={ref}
    className={`flex h-10 items-center border-b border-charcoal-border text-ink-muted overflow-x-auto ${className}`}
    {...props}
  />
));
TabsList.displayName = "TabsList";

const TabsTrigger = React.forwardRef(({ className = "", value, children, ...props }, ref) => {
  const { value: selectedValue, onValueChange } = React.useContext(TabsContext);
  const isActive = value === selectedValue;

  return (
    <button
      ref={ref}
      onClick={() => onValueChange(value)}
      className={`inline-flex items-center justify-center whitespace-nowrap px-3 py-3 min-h-[44px] text-[13px] font-medium transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 ${
        isActive
          ? 'text-ink border-b-2 border-brand'
          : 'text-ink-muted hover:text-ink-muted'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
});
TabsTrigger.displayName = "TabsTrigger";

const TabsContent = React.forwardRef(({ className = "", value, children, ...props }, ref) => {
  const { value: selectedValue } = React.useContext(TabsContext);

  if (value !== selectedValue) return null;

  return (
    <div
      ref={ref}
      className={`mt-2 focus-visible:outline-none ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});
TabsContent.displayName = "TabsContent";

export { Tabs, TabsList, TabsTrigger, TabsContent };
