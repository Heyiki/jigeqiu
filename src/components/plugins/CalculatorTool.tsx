import React, { useState, useEffect } from 'react';
import { ToolWindowWrapper } from './ToolWindowWrapper';
import { Calculator } from 'lucide-react';

interface CalculatorToolProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CalculatorTool: React.FC<CalculatorToolProps> = ({
  isOpen,
  onClose,
}) => {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [waitingForNext, setWaitingForNext] = useState(false);

  const inputDigit = (digit: string) => {
    if (waitingForNext) {
      setDisplay(digit);
      setWaitingForNext(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const inputDot = () => {
    if (waitingForNext) {
      setDisplay('0.');
      setWaitingForNext(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clearAll = () => {
    setDisplay('0');
    setPrevValue(null);
    setOperator(null);
    setWaitingForNext(false);
  };

  const toggleSign = () => {
    const val = parseFloat(display);
    setDisplay(String(-val));
  };

  const inputPercent = () => {
    const val = parseFloat(display);
    setDisplay(String(val / 100));
  };

  const performOperation = (nextOperator: string) => {
    const inputValue = parseFloat(display);

    if (prevValue === null) {
      setPrevValue(inputValue);
    } else if (operator) {
      const current = prevValue || 0;
      let result = 0;
      switch (operator) {
        case '+':
          result = current + inputValue;
          break;
        case '-':
          result = current - inputValue;
          break;
        case '×':
          result = current * inputValue;
          break;
        case '÷':
          result = inputValue !== 0 ? current / inputValue : 0;
          break;
      }
      setPrevValue(result);
      setDisplay(String(result));
    }

    setWaitingForNext(true);
    setOperator(nextOperator);
  };

  const handleEquals = () => {
    if (!operator || prevValue === null) return;
    performOperation(operator);
    setOperator(null);
  };

  // Keyboard support
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        inputDigit(e.key);
      } else if (e.key === '.') {
        inputDot();
      } else if (e.key === '+' || e.key === '-') {
        performOperation(e.key);
      } else if (e.key === '*') {
        performOperation('×');
      } else if (e.key === '/') {
        performOperation('÷');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Backspace') {
        setDisplay(prev => (prev.length > 1 ? prev.slice(0, -1) : '0'));
      } else if (e.key === 'Escape') {
        clearAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, display, prevValue, operator, waitingForNext]);

  return (
    <ToolWindowWrapper
      isOpen={isOpen}
      onClose={onClose}
      title="极简计算器"
      icon={<Calculator size={15} />}
      defaultWidth="max-w-xs"
    >
      <div className="flex flex-col gap-3 select-none">
        {/* Display Screen */}
        <div className="bg-black/10 dark:bg-black/40 rounded-2xl p-4 text-right">
          <div className="text-[11px] text-slate-400 h-4">
            {prevValue !== null && operator ? `${prevValue} ${operator}` : ''}
          </div>
          <div className="text-3xl font-light tracking-tight text-slate-800 dark:text-slate-100 font-mono truncate">
            {display}
          </div>
        </div>

        {/* Buttons Grid */}
        <div className="grid grid-cols-4 gap-2">
          <button
            onClick={clearAll}
            className="p-3 text-sm font-medium rounded-xl bg-slate-200/70 dark:bg-slate-700/60 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            AC
          </button>
          <button
            onClick={toggleSign}
            className="p-3 text-sm font-medium rounded-xl bg-slate-200/70 dark:bg-slate-700/60 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            ±
          </button>
          <button
            onClick={inputPercent}
            className="p-3 text-sm font-medium rounded-xl bg-slate-200/70 dark:bg-slate-700/60 hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            %
          </button>
          <button
            onClick={() => performOperation('÷')}
            className={`p-3 text-base font-semibold rounded-xl text-white transition-colors ${
              operator === '÷' ? 'bg-amber-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            ÷
          </button>

          {['7', '8', '9'].map(d => (
            <button
              key={d}
              onClick={() => inputDigit(d)}
              className="p-3 text-base font-medium rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-colors shadow-2xs font-mono"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => performOperation('×')}
            className={`p-3 text-base font-semibold rounded-xl text-white transition-colors ${
              operator === '×' ? 'bg-amber-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            ×
          </button>

          {['4', '5', '6'].map(d => (
            <button
              key={d}
              onClick={() => inputDigit(d)}
              className="p-3 text-base font-medium rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-colors shadow-2xs font-mono"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => performOperation('-')}
            className={`p-3 text-base font-semibold rounded-xl text-white transition-colors ${
              operator === '-' ? 'bg-amber-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            -
          </button>

          {['1', '2', '3'].map(d => (
            <button
              key={d}
              onClick={() => inputDigit(d)}
              className="p-3 text-base font-medium rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-colors shadow-2xs font-mono"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => performOperation('+')}
            className={`p-3 text-base font-semibold rounded-xl text-white transition-colors ${
              operator === '+' ? 'bg-amber-600' : 'bg-amber-500 hover:bg-amber-600'
            }`}
          >
            +
          </button>

          <button
            onClick={() => inputDigit('0')}
            className="col-span-2 p-3 text-base font-medium rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-colors shadow-2xs font-mono"
          >
            0
          </button>
          <button
            onClick={inputDot}
            className="p-3 text-base font-medium rounded-xl bg-white/60 dark:bg-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition-colors shadow-2xs font-mono"
          >
            .
          </button>
          <button
            onClick={handleEquals}
            className="p-3 text-base font-semibold rounded-xl bg-sky-500 hover:bg-sky-600 text-white transition-colors shadow-sm"
          >
            =
          </button>
        </div>
      </div>
    </ToolWindowWrapper>
  );
};
