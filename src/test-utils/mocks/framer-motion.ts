import React from 'react'

const motionKeys = new Set(['variants', 'initial', 'animate', 'exit', 'transition', 'custom'])

export const framerMotionMock = {
  AnimatePresence: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  motion: {
    div: React.forwardRef(function MotionDiv({ children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) {
      const domProps = Object.fromEntries(Object.entries(props).filter(([k]) => !motionKeys.has(k)))
      return React.createElement('div', { ...domProps, ref }, children as React.ReactNode)
    }),
  },
}
