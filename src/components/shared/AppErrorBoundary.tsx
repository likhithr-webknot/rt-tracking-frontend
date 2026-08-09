// @ts-nocheck
import React from "react";
import ErrorPage from "./ErrorPage";

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    console.error("[AppErrorBoundary]", error);
  }

  render() {
    const { error } = this.state;
    const { children } = this.props;

    if (!error) return children;

    return (
      <ErrorPage
        code="!"
        title="Something Broke"
        message="The app crashed while rendering. You can reload or clear your session to try again."
        error={error}
      />
    );
  }
}
