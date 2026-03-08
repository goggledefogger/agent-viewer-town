on run
	do shell script "zsh -l -c 'cd /Users/Danny/Source/agent-viewer-town && npm run dev > /tmp/agent-viewer-dev.log 2>&1 & echo $! > /tmp/agent-viewer-dev.pid'"
end run

on quit
	try
		do shell script "kill $(cat /tmp/agent-viewer-dev.pid)"
	end try
	try
		do shell script "pkill -f 'concurrently.*packages/server'"
	end try
	try
		do shell script "pkill -f 'tsx watch src/index.ts'"
	end try
	try
		do shell script "pkill -f 'vite'"
	end try
	continue quit
end quit
