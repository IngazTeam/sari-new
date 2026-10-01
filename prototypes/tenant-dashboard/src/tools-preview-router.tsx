import React from "react";
export function Link({ href, ...props }: React.ComponentProps<"a">) {
  return <a {...props} href={"#/page" + href} />;
}
