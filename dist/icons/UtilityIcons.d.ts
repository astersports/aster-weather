/**
 * Utility icons — wind + droplet. NOT weather-condition icons and NOT part of the
 * Sky system: these are small metric glyphs (a wind-speed / humidity row), kept
 * so consumers on that surface don't have to reach for another icon set. They use
 * a 24-viewBox and their own per-instance gradient id; unlike WeatherIcon they do
 * not require a sky panel.
 */
import * as React from "react";
export interface UtilityIconProps {
    className?: string;
    label?: string;
    style?: React.CSSProperties;
}
export declare function WindIcon(props: UtilityIconProps): React.JSX.Element;
export declare function DropletIcon(props: UtilityIconProps): React.JSX.Element;
//# sourceMappingURL=UtilityIcons.d.ts.map