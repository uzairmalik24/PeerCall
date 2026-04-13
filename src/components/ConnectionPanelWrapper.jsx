import ConnectionDisclaimer from './ConnectionDisclaimer'

export default function ConnectionPanelWrapper({ context = 'general', children }) {
  return (
    <div className="connection-panel-wrapper">
      {children}
      <ConnectionDisclaimer context={context} />
    </div>
  )
}
