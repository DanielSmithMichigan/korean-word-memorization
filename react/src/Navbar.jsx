import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

function Navbar() {
  const location = useLocation();
  const query = location.search; // includes the leading "?" if present
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="bg-gray-800 p-4">
      <div className="container mx-auto flex justify-between items-center">
        {/* Desktop Nav */}
        <div className="hidden md:flex w-full justify-evenly">
            <Link to={`/quiz-setup${query}`} className="text-white font-bold">Quiz</Link>
            <Link to={`/extractor${query}`} className="text-white font-bold">Extractor</Link>
            <Link to={`/overwatch${query}`} className="text-white font-bold">Overwatch</Link>
            <Link to={`/${query}`} className="text-white font-bold">Upload</Link>
            <Link to={`/typing-test${query}`} className="text-white font-bold">Typing Test</Link>
        </div>

        {/* Mobile Nav */}
        <div className="md:hidden flex w-full justify-between items-center">
            <div className="flex space-x-4">
                <Link to={`/quiz-setup${query}`} className="text-white font-bold">Quiz</Link>
                <Link to={`/extractor${query}`} className="text-white font-bold">Extractor</Link>
                <Link to={`/overwatch${query}`} className="text-white font-bold">Overwatch</Link>
            </div>
            <button onClick={() => setIsOpen(!isOpen)} className="text-white">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7"></path>
                </svg>
            </button>
        </div>
      </div>

      {/* Mobile Menu (Hamburger) */}
      {isOpen && (
        <div className="md:hidden mt-2">
          <Link to={`/${query}`} className="block text-white font-bold px-2 py-1">Upload</Link>
          <Link to={`/typing-test${query}`} className="block text-white font-bold px-2 py-1">Typing Test</Link>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
