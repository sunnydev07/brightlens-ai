import ReactMarkdown from 'react-markdown'
import type { ComponentPropsWithoutRef } from 'react'

function stripNode<T extends { node?: unknown }>(props: T): Omit<T, 'node'> {
  const { node, ...rest } = props
  void node
  return rest
}

/** Markdown renderer styled via the `.md` content surface. */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        components={{
          a: (props) => (
            <a target="_blank" rel="noopener noreferrer" {...stripNode(props)} />
          ),
          code: (componentProps) => {
            const { inline, ...props } = stripNode(
              componentProps,
            ) as ComponentPropsWithoutRef<'code'> & { inline?: boolean }
            void inline
            return <code {...props} />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
