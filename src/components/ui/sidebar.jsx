import * as React from "react";
import { createContext, useContext, useState } from "react";
import { Menu, X } from "lucide-react";

const ActionBarContext = createContext({ open: false, setOpen: () => {} });

export const ActionBarProvider = ({ children }) => {
  const [open, setOpen] = useState(false);

  return (
    <ActionBarContext.Provider value={{ open, setOpen }}>
      {children}
    </ActionBarContext.Provider>
  );
};

export const ActionBar = ({ className = "", children, ...props }) => {
  const { open, setOpen } = useContext(ActionBarContext);

  return (
    <>
      {/* Overlay backdrop for mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
      {/* Header Navigation */}
      <nav
        className={`fixed md:sticky top-0 left-0 right-0 w-full h-screen md:h-auto bg-[#1a1a1a]  flex flex-col md:flex-row md:items-center md:px-6 md:py-4 flex-shrink-0 transition-transform duration-300 z-50 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } md:border-b md:border-[#2a2a2a] ${className}`}
        {...props}
      >
        {children}
      </nav>
    </>
  );
}

export const ActionBarHeader = ({ className = "", children, ...props }) => (
  <div className={`px-4 py-2 ${className}`} {...props}>
    {children}
  </div>
);

export const ActionBarContent = ({ className = "", children, ...props }) => (
  <div className={`flex-1 overflow-auto px-4 py-3 md:flex md:items-center md:px-0 md:py-0 md:flex-1 ${className}`} {...props}>
    {children}
  </div>
);

export const ActionBarFooter = ({ className = "", children, ...props }) => (
  <div className={`mt-auto px-4 py-2 ${className}`} {...props}>
    {children}
  </div>
);

export const ActionBarGroup = ({ className = "", children, ...props }) => (
  <div className={`${className}`} {...props}>
    {children}
  </div>
);

export const ActionBarGroupContent = ({ className = "", children, ...props }) => (
  <div className={`${className}`} {...props}>
    {children}
  </div>
);

export const ActionBarMenu = ({ className = "", children, ...props }) => (
  <ul className={`space-y-1 ${className}`} {...props}>
    {children}
  </ul>
);

export const ActionBarMenuItem = ({ className = "", children, ...props }) => (
  <li className={`${className}`} {...props}>
    {children}
  </li>
);

export const ActionBarMenuButton = ({
  className = "",
  asChild = false,
  children,
  ...props
}) => {
  const { setOpen } = useContext(ActionBarContext);

  const handleClick = (e) => {
    children.props?.onClick?.(e);
    setOpen(false);
  };

  if (asChild) {
    return React.cloneElement(children, {
      className: `${children.props.className || ''} ${className}`,
      onClick: handleClick,
    });
  }

  return (
    <button className={`w-full text-left ${className}`} onClick={handleClick} {...props}>
      {children}
    </button>
  );
};

export const ActionBarTrigger = ({ className = "", ...props }) => {
  const { open, setOpen } = useContext(ActionBarContext);

  return (
    <button
      onClick={() => setOpen(!open)}
      className={`${className}`}
      {...props}
    >
      <Menu className="w-5 h-5" />
    </button>
  );
};

export const ActionBarClose = ({ className = "", ...props }) => {
  const { setOpen } = useContext(ActionBarContext);

  return (
    <button
      onClick={() => setOpen(false)}
      className={`${className}`}
      {...props}
    >
      <X className="w-5 h-5" />
    </button>
  );
};
