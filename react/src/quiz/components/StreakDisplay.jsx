import React from 'react';
import { FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

function StreakDisplay({ history }) {
  return (
    <div className="flex justify-center items-center space-x-2 my-4 h-6">
      {history.map((success, index) => (
        success
          ? <FaCheckCircle key={index} className="text-green-500 h-6 w-6" />
          : <FaTimesCircle key={index} className="text-red-500 h-6 w-6" />
      ))}
    </div>
  );
}

export default StreakDisplay;
