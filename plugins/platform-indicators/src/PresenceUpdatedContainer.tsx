// ✅ React do metro/common, não do node_modules
import { React } from "@vendetta/metro/common";
import { FluxDispatcher } from "@vendetta/metro/common";

const { useState, useEffect } = React;

const PresenceUpdatedContainer = ({ children }: { children: React.ReactNode }) => {
    const [counter, setCounter] = useState(0);

    useEffect(() => {
        const presenceUpdate = () => setCounter(prev => prev + 1);
        FluxDispatcher.subscribe("PRESENCE_UPDATES", presenceUpdate);
        return () => FluxDispatcher.unsubscribe("PRESENCE_UPDATES", presenceUpdate);
    }, []);

    return React.createElement(
        React.Fragment,
        null,
        ...React.Children.map(children, (child, index) =>
            React.cloneElement(child as React.ReactElement, { key: `${index}-${counter}` })
        ) ?? []
    );
};

export default PresenceUpdatedContainer;
