export default function SkeletonMap() {
    return (
        <div className="w-full h-full relative bg-gray-200 dark:bg-gray-800 animate-pulse overflow-hidden">
            {/* Abstract Map Grid Pattern */}
            <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full" style={{
                    backgroundImage: 'linear-gradient(#000000 1px, transparent 1px), linear-gradient(90deg, #000000 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }}></div>
            </div>

            {/* Fake UI Elements */}
            <div className="absolute top-4 left-4 right-4 flex gap-2">
                <div className="h-10 w-full bg-gray-300 dark:bg-gray-700 rounded-lg shadow-sm"></div>
            </div>

            <div className="absolute bottom-8 right-4 flex flex-col gap-2">
                <div className="h-10 w-10 bg-gray-300 dark:bg-gray-700 rounded-full shadow-sm"></div>
                <div className="h-10 w-10 bg-gray-300 dark:bg-gray-700 rounded-full shadow-sm"></div>
            </div>
        </div>
    );
}
