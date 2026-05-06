import { FluxDispatcher } from "@vendetta/metro/common";
import React, { useState, useEffect } from "react";

const PresenceUpdatedContainer = ({ children }: { children: React.ReactNode }) => {
    const [counter, setCounter] = useState(0);

    useEffect(() => {
        const presenceUpdate = () => setCounter(prev => prev + 1);
        FluxDispatcher.subscribe("PRESENCE_UPDATES", presenceUpdate);
        return () => FluxDispatcher.unsubscribe("PRESENCE_UPDATES", presenceUpdate);
    }, []);

    return (
        <>
            {React.Children.map(children, (child, index) =>
                React.cloneElement(child as React.ReactElement, { key: `${index}-${counter}` })
            )}
        </>
    );
};

export default PresenceUpdatedContainer;
