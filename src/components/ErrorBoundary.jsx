import { Component } from 'react';
import { Button, PageHeader, Card, ErrorState } from '@/components/ui';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-charcoal">
          <div className="mx-auto max-w-2xl pt-[max(1rem,env(safe-area-inset-top))]">
            <PageHeader eyebrow="OptiGains" title="Something broke" />
            <Card>
              <ErrorState title="This page hit an error">
                {this.state.error?.message || 'Unexpected error. Retry, or go back to Today.'}
              </ErrorState>
              <div className="flex gap-2 px-gutter pb-4">
                <Button variant="primary" onClick={this.handleReset}>Try again</Button>
                <Button variant="secondary" onClick={() => { window.location.href = '/today'; }}>Go to Today</Button>
              </div>
            </Card>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
