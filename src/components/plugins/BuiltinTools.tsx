import { CalculatorTool } from './CalculatorTool';
import { JsonFormatterTool } from './JsonFormatterTool';
import { WordCounterTool } from './WordCounterTool';

// Keep drafts mounted after the first use, matching the original tool behavior.
export default function BuiltinTools({ calculatorOpen, jsonOpen, wordCounterOpen,
  onCloseCalculator, onCloseJson, onCloseWordCounter,
}: {
  calculatorOpen: boolean; jsonOpen: boolean; wordCounterOpen: boolean;
  onCloseCalculator(): void; onCloseJson(): void; onCloseWordCounter(): void;
}) {
  return <>
    <CalculatorTool isOpen={calculatorOpen} onClose={onCloseCalculator} />
    <JsonFormatterTool isOpen={jsonOpen} onClose={onCloseJson} />
    <WordCounterTool isOpen={wordCounterOpen} onClose={onCloseWordCounter} />
  </>;
}
