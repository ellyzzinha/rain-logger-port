import { ReactNative } from "@vendetta/metro/common";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { Forms } from "@vendetta/ui/components";

const { ScrollView, View } = ReactNative;

export default function Settings() {
    useProxy(storage);

    return (
        <ScrollView>
            <View>
                <Forms.FormSwitchRow
                    label="Show icons on the DM top bar"
                    value={storage.dmTopBar ?? true}
                    onValueChange={(v: boolean) => (storage.dmTopBar = v)}
                />
                <Forms.FormSwitchRow
                    label="Show icons on users and DMs list"
                    value={storage.userList ?? true}
                    onValueChange={(v: boolean) => (storage.userList = v)}
                />
                <Forms.FormSwitchRow
                    label="Show icons on user profiles"
                    value={storage.profileUsername ?? true}
                    onValueChange={(v: boolean) => (storage.profileUsername = v)}
                />
                <Forms.FormSwitchRow
                    label="Hide mobile status from default indicator"
                    value={storage.removeDefaultMobile ?? true}
                    onValueChange={(v: boolean) => (storage.removeDefaultMobile = v)}
                />
                <Forms.FormSwitchRow
                    label="Theme compatibility mode (fallback colors)"
                    value={storage.fallbackColors ?? false}
                    onValueChange={(v: boolean) => (storage.fallbackColors = v)}
                />
            </View>
        </ScrollView>
    );
}
