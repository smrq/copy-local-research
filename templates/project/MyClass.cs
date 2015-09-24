using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace <%= name %>
{
	public class MyClass
	{
<% _.forEach(refs, function (ref) { %>
		public <%= ref.name %>.MyClass <%= ref.name %> { get; set; }
<% }) %>
	}
}
