// TipSelector.js
import React from "react";
import { Box, Button, HStack, Input } from "@chakra-ui/react";
import {roundToTwo} from "../../utils/decimalUtils";

export default function TipSelector({
                                        totalCost = 0,
                                        tip,
                                        setTip,
                                        // If true, immediately compute tip from totalCost (e.g. "pay now").
                                        // If false, do not compute until final step (e.g. "pay later").
                                        isImmediateCalculation = false,
                                    }) {
    const { tipOption, tipAmount, customTip } = tip;

    // Handler for selecting a tip button (5%, 10%, 15%, custom, noTip)
    const handleSelectTip = (option) => {
        let newTipAmount = "0.00";
        if (option === "5" || option === "10" || option === "15") {
            const tipPct = parseInt(option, 10);
            newTipAmount = roundToTwo((totalCost * tipPct) / 100).toFixed(2);

        }

        setTip((prev) => ({
            ...prev,
            tipOption: option,
            tipType:
                option === "noTip"
                    ? "noTip"
                    : option === "custom"
                        ? "custom"
                        : "percentage",
            tipPercentage: option === "custom" ? 0 : parseInt(option, 10),
            tipAmount: option === "noTip" ? "0.00" : newTipAmount,
            customTip: option === "custom" ? prev.customTip : "",
        }));
    };


    const handleCustomTipChange = (e) => {
        const value = e.target.value.replace(/[^0-9.]/g, ""); // Only allow numbers and decimals
        setTip((prev) => ({
            ...prev,
            customTip: value,
            tipAmount: value ? roundToTwo(parseFloat(value)).toFixed(2) : "0.00",

        }));
    };

    const handleCustomTipBlur = () => {
        const numericVal = parseFloat(tip.customTip);
        if (!isNaN(numericVal)) {
            setTip((prev) => ({
                ...prev,
                customTip: roundToTwo(numericVal).toFixed(2),
                tipAmount: roundToTwo(numericVal).toFixed(2),

            }));
        } else {
            setTip((prev) => ({
                ...prev,
                customTip: "",
                tipAmount: "0.00",
            }));
        }
    };


    return (
        <Box>
            {/* Tip Buttons */}
            <HStack spacing={2} wrap="wrap" mb={3}>
                <Button
                    variant={tipOption === "5" ? "solid" : "outline"}
                    onClick={() => handleSelectTip("5")}
                >
                    5%
                </Button>
                <Button
                    variant={tipOption === "10" ? "solid" : "outline"}
                    onClick={() => handleSelectTip("10")}
                >
                    10%
                </Button>
                <Button
                    variant={tipOption === "15" ? "solid" : "outline"}
                    onClick={() => handleSelectTip("15")}
                >
                    15%
                </Button>
                <Button
                    variant={tipOption === "custom" ? "solid" : "outline"}
                    onClick={() => handleSelectTip("custom")}
                >
                    Custom
                </Button>
                <Button
                    variant={tipOption === "noTip" ? "solid" : "outline"}
                    onClick={() => handleSelectTip("noTip")}
                >
                    No Tip
                </Button>
            </HStack>

            {/* Only show custom tip input if "custom" is selected */}
            {tipOption === "custom" && (
                <Box mb={3}>
                    <Input
                        type="text"
                        placeholder="Enter custom tip amount"
                        value={customTip}
                        onChange={handleCustomTipChange}
                        onBlur={handleCustomTipBlur}
                        width={{ base: "100%", md: "200px" }}
                    />
                </Box>
            )}
        </Box>
    );
}
